import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { ScoringService } from '../scoring/scoring.service';
import {
  CancelRedemptionDTO,
  CreateRewardDTO,
  ListRedemptionsQueryDTO,
  ListRewardsQueryDTO,
  UpdateRewardDTO,
} from './reward.dto';

export class RewardService {
  // ─── CRUD do catálogo (configurável pelo administrador) ──────────────────────

  public static async list(query: ListRewardsQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Catálogo público, por padrão, esconde prêmios INATIVOS (retirados de linha).
    const where: Record<string, unknown> = query.status ? { status: query.status } : { status: { not: 'INACTIVE' } };

    const [total, rewards] = await Promise.all([
      prisma.reward.count({ where }),
      prisma.reward.findMany({ where, orderBy: { pointsCost: 'asc' }, skip, take: limit }),
    ]);

    return { rewards, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  public static async getById(id: string) {
    const reward = await prisma.reward.findUnique({ where: { id } });
    if (!reward) throw new NotFoundError(`Premiação com ID '${id}' não foi encontrada.`);
    return reward;
  }

  public static async create(dto: CreateRewardDTO, adminId: string) {
    const created = await prisma.reward.create({ data: dto });

    await prisma.auditLog.create({
      data: { userId: adminId, action: 'CREATE', entity: 'Reward', entityId: created.id, newValues: JSON.stringify(created) },
    });

    return created;
  }

  public static async update(id: string, dto: UpdateRewardDTO, adminId: string) {
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Premiação com ID '${id}' não foi encontrada.`);

    const updated = await prisma.reward.update({ where: { id }, data: dto });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'Reward',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return updated;
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.reward.findUnique({
      where: { id },
      include: { _count: { select: { userRewards: true, pointsTransactions: true } } },
    });
    if (!existing) throw new NotFoundError(`Premiação com ID '${id}' não foi encontrada.`);

    const hasHistory = existing._count.userRewards > 0 || existing._count.pointsTransactions > 0;

    let status: 'DELETED' | 'DEACTIVATED';
    if (hasHistory) {
      // Regra de ouro do ledger: nunca excluir algo já referenciado em points_transactions.
      await prisma.reward.update({ where: { id }, data: { status: 'INACTIVE' } });
      status = 'DEACTIVATED';
    } else {
      await prisma.reward.delete({ where: { id } });
      status = 'DELETED';
    }

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: status === 'DELETED' ? 'DELETE' : 'DEACTIVATE',
        entity: 'Reward',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({ status }),
      },
    });

    return {
      status,
      message:
        status === 'DELETED'
          ? 'Premiação excluída com sucesso.'
          : 'Premiação já possui resgates registrados — desativada em vez de excluída para preservar o histórico.',
    };
  }

  // ─── Resgate ─────────────────────────────────────────────────────────────────

  /**
   * Resgata uma premiação: debita os pontos do usuário através do MESMO motor
   * de pontuação oficial (ScoringService.creditPoints), garantindo que nível e
   * conquistas sejam reavaliados consistentemente também para débitos.
   */
  public static async redeem(rewardId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward) throw new NotFoundError(`Premiação com ID '${rewardId}' não foi encontrada.`);

      if (reward.status !== 'AVAILABLE') {
        throw new AppError('Esta premiação não está disponível para resgate no momento.', 422, 'REWARD_UNAVAILABLE');
      }
      if (reward.quantityAvailable <= 0) {
        throw new AppError('Esta premiação está fora de estoque.', 422, 'OUT_OF_STOCK');
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { totalPoints: true } });
      if (!user) throw new NotFoundError(`Usuário com ID '${userId}' não encontrado.`);
      if (user.totalPoints < reward.pointsCost) {
        throw new AppError(
          `Pontos insuficientes para este resgate (necessário: ${reward.pointsCost}, disponível: ${user.totalPoints}).`,
          422,
          'INSUFFICIENT_POINTS',
        );
      }

      // Cria o registro de resgate primeiro para vincular a transação de pontos a ele
      // via referenceType/referenceId — permite identificar exatamente qual resgate
      // originou qual débito, mesmo se o mesmo prêmio for resgatado várias vezes.
      const userReward = await tx.userReward.create({
        data: { rewardId, userId, status: 'REQUESTED' },
      });

      const creditResult = await ScoringService.creditPoints(
        {
          userId,
          points: -reward.pointsCost,
          transactionType: 'REWARD',
          description: `Resgate da premiação: ${reward.title}`,
          rewardId: reward.id,
          referenceType: 'UserReward',
          referenceId: userReward.id,
        },
        tx,
      );

      const remaining = reward.quantityAvailable - 1;
      await tx.reward.update({
        where: { id: rewardId },
        data: { quantityAvailable: remaining, ...(remaining === 0 ? { status: 'OUT_OF_STOCK' } : {}) },
      });

      return { userReward, transaction: creditResult.transaction, newTotalPoints: creditResult.newTotalPoints };
    });
  }

  // ─── Ciclo de vida do resgate (administrativo) ────────────────────────────────

  public static async approveRedemption(userRewardId: string, adminId: string) {
    const userReward = await prisma.userReward.findUnique({ where: { id: userRewardId }, include: { reward: true } });
    if (!userReward) throw new NotFoundError(`Resgate com ID '${userRewardId}' não foi encontrado.`);
    if (userReward.status !== 'REQUESTED') {
      throw new AppError(`Este resgate não pode ser aprovado (status atual: ${userReward.status}).`, 422, 'INVALID_STATUS_TRANSITION');
    }

    const updated = await prisma.userReward.update({
      where: { id: userRewardId },
      data: { status: 'APPROVED', processedAt: new Date(), processedBy: adminId },
    });

    await NotificationService.create({
      userId: userReward.userId,
      title: 'Resgate aprovado! 🎁',
      message: `Seu resgate de "${userReward.reward.title}" foi aprovado e está em preparação.`,
      type: 'REWARD_UPDATE',
      referenceId: userReward.id,
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'APPROVE_REDEMPTION',
        entity: 'UserReward',
        entityId: userRewardId,
        oldValues: JSON.stringify({ status: 'REQUESTED' }),
        newValues: JSON.stringify({ status: 'APPROVED' }),
      },
    });

    return updated;
  }

  public static async deliverRedemption(userRewardId: string, adminId: string) {
    const userReward = await prisma.userReward.findUnique({ where: { id: userRewardId }, include: { reward: true } });
    if (!userReward) throw new NotFoundError(`Resgate com ID '${userRewardId}' não foi encontrado.`);
    if (userReward.status !== 'APPROVED') {
      throw new AppError(`Este resgate precisa estar APROVADO antes de ser entregue (status atual: ${userReward.status}).`, 422, 'INVALID_STATUS_TRANSITION');
    }

    const updated = await prisma.userReward.update({
      where: { id: userRewardId },
      data: { status: 'DELIVERED', processedAt: new Date(), processedBy: adminId },
    });

    await NotificationService.create({
      userId: userReward.userId,
      title: 'Prêmio entregue! ✅',
      message: `Seu resgate de "${userReward.reward.title}" foi entregue.`,
      type: 'REWARD_UPDATE',
      referenceId: userReward.id,
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'DELIVER_REDEMPTION',
        entity: 'UserReward',
        entityId: userRewardId,
        oldValues: JSON.stringify({ status: 'APPROVED' }),
        newValues: JSON.stringify({ status: 'DELIVERED' }),
      },
    });

    return updated;
  }

  /**
   * Cancela um resgate ainda não entregue, estornando os pontos ao usuário
   * (via REVERSAL da transação REWARD original) e devolvendo 1 unidade ao
   * estoque — tudo em uma única transação atômica.
   */
  public static async cancelRedemption(userRewardId: string, dto: CancelRedemptionDTO, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const userReward = await tx.userReward.findUnique({ where: { id: userRewardId } });
      if (!userReward) throw new NotFoundError(`Resgate com ID '${userRewardId}' não foi encontrado.`);

      if (userReward.status === 'DELIVERED') {
        throw new AppError('Não é possível cancelar um resgate que já foi entregue.', 422, 'CANNOT_CANCEL_DELIVERED');
      }
      if (userReward.status === 'CANCELLED') {
        throw new AppError('Este resgate já foi cancelado anteriormente.', 409, 'ALREADY_CANCELLED');
      }

      const originalTransaction = await tx.pointsTransaction.findFirst({
        where: { referenceType: 'UserReward', referenceId: userReward.id, transactionType: 'REWARD' },
      });

      if (originalTransaction) {
        // reverseTransaction já cria a notificação de estorno de pontos (Fase 16),
        // com o motivo do cancelamento incluído na mensagem.
        await ScoringService.reverseTransaction(originalTransaction.id, { reason: dto.reason }, adminId, tx);
      } else {
        await NotificationService.create(
          {
            userId: userReward.userId,
            title: 'Resgate cancelado',
            message: `Seu resgate foi cancelado: ${dto.reason}`,
            type: 'REWARD_UPDATE',
            referenceId: userReward.id,
          },
          tx,
        );
      }

      const updated = await tx.userReward.update({
        where: { id: userRewardId },
        data: { status: 'CANCELLED', processedAt: new Date(), processedBy: adminId },
      });

      // Devolve 1 unidade ao estoque e reativa o prêmio se estava esgotado
      const reward = await tx.reward.findUnique({ where: { id: userReward.rewardId } });
      if (reward) {
        await tx.reward.update({
          where: { id: reward.id },
          data: {
            quantityAvailable: { increment: 1 },
            ...(reward.status === 'OUT_OF_STOCK' ? { status: 'AVAILABLE' } : {}),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'CANCEL_REDEMPTION',
          entity: 'UserReward',
          entityId: userRewardId,
          oldValues: JSON.stringify({ status: userReward.status }),
          newValues: JSON.stringify({ status: 'CANCELLED', reason: dto.reason, refunded: !!originalTransaction }),
        },
      });

      return updated;
    });
  }

  // ─── Consulta de resgates ────────────────────────────────────────────────────

  public static async listRedemptions(query: ListRedemptionsQueryDTO, requestingUserId: string, isAdmin: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const userId = isAdmin ? query.userId : requestingUserId;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (query.status) where.status = query.status;

    const [total, redemptions] = await Promise.all([
      prisma.userReward.count({ where }),
      prisma.userReward.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip,
        take: limit,
        include: {
          reward: { select: { id: true, title: true, pointsCost: true, imageUrl: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    return { redemptions, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  public static async getRedemptionById(id: string, requestingUserId: string, isAdmin: boolean) {
    const redemption = await prisma.userReward.findUnique({
      where: { id },
      include: { reward: true, user: { select: { id: true, name: true } } },
    });
    if (!redemption) throw new NotFoundError(`Resgate com ID '${id}' não foi encontrado.`);
    if (!isAdmin && redemption.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar o resgate de outro usuário.');
    }
    return redemption;
  }
}
