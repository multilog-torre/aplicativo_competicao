import { Challenge } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { TransactionClient } from '../../shared/types/prisma';
import { LevelService } from '../levels/level.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateChallengeDTO, ListChallengesQueryDTO, UpdateChallengeDTO } from './challenge.dto';

export type EffectiveStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/**
 * O status "administrável" de um desafio só existe para permitir CANCELLED.
 * UPCOMING/ACTIVE/COMPLETED são sempre derivados das datas — nunca ficam
 * dessincronizados de startDate/endDate por esquecimento do administrador.
 */
function computeEffectiveStatus(challenge: { status: string; startDate: Date; endDate: Date }): EffectiveStatus {
  if (challenge.status === 'CANCELLED') return 'CANCELLED';
  const now = new Date();
  if (now < challenge.startDate) return 'UPCOMING';
  if (now > challenge.endDate) return 'COMPLETED';
  return 'ACTIVE';
}

function toPublicShape<T extends { status: string; startDate: Date; endDate: Date }>(challenge: T) {
  return { ...challenge, effectiveStatus: computeEffectiveStatus(challenge) };
}

export class ChallengeService {
  // ─── CRUD (configurável pelo administrador) ──────────────────────────────────

  public static async list(query: ListChallengesQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Record<string, unknown> = {};
    if (query.scope) where.scope = query.scope;

    const all = await prisma.challenge.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: { activityType: { select: { id: true, name: true, icon: true } }, _count: { select: { participants: true } } },
    });

    let shaped = all.map(toPublicShape);
    if (query.effectiveStatus) {
      shaped = shaped.filter((c) => c.effectiveStatus === query.effectiveStatus);
    }

    const total = shaped.length;
    const skip = (page - 1) * limit;
    const paginated = shaped.slice(skip, skip + limit);

    return { challenges: paginated, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  public static async getById(id: string) {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: { activityType: { select: { id: true, name: true, icon: true } }, _count: { select: { participants: true } } },
    });
    if (!challenge) throw new NotFoundError(`Desafio com ID '${id}' não foi encontrado.`);
    return toPublicShape(challenge);
  }

  public static async create(dto: CreateChallengeDTO, adminId: string) {
    if (dto.activityTypeId) {
      const activityType = await prisma.activityType.findUnique({ where: { id: dto.activityTypeId } });
      if (!activityType) throw new NotFoundError(`Modalidade com ID '${dto.activityTypeId}' não foi encontrada.`);
    }

    const created = await prisma.challenge.create({
      data: { ...dto, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CREATE',
        entity: 'Challenge',
        entityId: created.id,
        newValues: JSON.stringify(created),
      },
    });

    return toPublicShape(created);
  }

  public static async update(id: string, dto: UpdateChallengeDTO, adminId: string) {
    const existing = await prisma.challenge.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Desafio com ID '${id}' não foi encontrado.`);

    const nextStart = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const nextEnd = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (nextStart.getTime() >= nextEnd.getTime()) {
      throw new AppError('startDate deve ser anterior a endDate.', 422, 'INVALID_DATE_RANGE');
    }

    if (dto.activityTypeId) {
      const activityType = await prisma.activityType.findUnique({ where: { id: dto.activityTypeId } });
      if (!activityType) throw new NotFoundError(`Modalidade com ID '${dto.activityTypeId}' não foi encontrada.`);
    }

    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate ? { startDate: nextStart } : {}),
        ...(dto.endDate ? { endDate: nextEnd } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'Challenge',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return toPublicShape(updated);
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.challenge.findUnique({
      where: { id },
      include: { _count: { select: { participants: true, pointsTransactions: true } } },
    });
    if (!existing) throw new NotFoundError(`Desafio com ID '${id}' não foi encontrado.`);

    const hasHistory = existing._count.participants > 0 || existing._count.pointsTransactions > 0;

    let status: 'DELETED' | 'CANCELLED';
    if (hasHistory) {
      // Regra de ouro do ledger: nunca excluir algo já referenciado em points_transactions.
      await prisma.challenge.update({ where: { id }, data: { status: 'CANCELLED' } });
      status = 'CANCELLED';
    } else {
      await prisma.challenge.delete({ where: { id } });
      status = 'DELETED';
    }

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: status === 'DELETED' ? 'DELETE' : 'CANCEL',
        entity: 'Challenge',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({ status }),
      },
    });

    return {
      status,
      message:
        status === 'DELETED'
          ? 'Desafio excluído com sucesso.'
          : 'Desafio já possui participantes ou pontos concedidos — cancelado em vez de excluído para preservar o histórico.',
    };
  }

  // ─── Participação ──────────────────────────────────────────────────────────────

  /**
   * Calcula o progresso retroativo do usuário no desafio, somando a quantidade
   * de atividades já APROVADAS dentro do período do desafio (e da modalidade,
   * se especificada) — permite entrar em um desafio já em andamento sem perder
   * o que já foi feito no período.
   */
  private static async computeRetroactiveProgress(
    client: TransactionClient | typeof prisma,
    userId: string,
    challenge: Challenge,
  ): Promise<number> {
    const result = await client.userActivity.aggregate({
      where: {
        userId,
        status: 'APPROVED',
        activityDate: { gte: challenge.startDate, lte: challenge.endDate },
        ...(challenge.activityTypeId ? { activityTypeId: challenge.activityTypeId } : {}),
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  public static async join(challengeId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw new NotFoundError(`Desafio com ID '${challengeId}' não foi encontrado.`);

      if (computeEffectiveStatus(challenge) !== 'ACTIVE') {
        throw new AppError('Este desafio não está ativo no momento.', 422, 'CHALLENGE_NOT_ACTIVE');
      }

      const existing = await tx.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });
      if (existing) {
        throw new AppError('Você já está participando deste desafio.', 409, 'ALREADY_JOINED');
      }

      const initialProgress = await this.computeRetroactiveProgress(tx, userId, challenge);
      const completed = initialProgress >= challenge.targetGoal;

      const participant = await tx.challengeParticipant.create({
        data: {
          challengeId,
          userId,
          currentProgress: initialProgress,
          completed,
          completedAt: completed ? new Date() : null,
        },
      });

      if (completed) {
        await this.awardCompletion(tx, userId, challenge);
      }

      return participant;
    });
  }

  /** Concede a recompensa de conclusão do desafio (ledger + reclassificação de nível). */
  private static async awardCompletion(tx: TransactionClient, userId: string, challenge: Challenge): Promise<void> {
    await NotificationService.create(
      {
        userId,
        title: 'Desafio concluído! 🎯',
        message:
          challenge.rewardPoints > 0
            ? `Você completou o desafio "${challenge.title}" e ganhou ${challenge.rewardPoints} pontos!`
            : `Você completou o desafio "${challenge.title}"!`,
        type: 'CHALLENGE_COMPLETED',
        referenceId: challenge.id,
      },
      tx,
    );

    if (challenge.rewardPoints <= 0) return;

    await tx.pointsTransaction.create({
      data: {
        userId,
        challengeId: challenge.id,
        transactionType: 'CHALLENGE',
        points: challenge.rewardPoints,
        description: `Desafio concluído: ${challenge.title}`,
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { totalPoints: { increment: challenge.rewardPoints } },
      select: { totalPoints: true },
    });

    await LevelService.recalculateForUser(userId, updatedUser.totalPoints, tx);
  }

  /**
   * Atualiza o progresso de todos os desafios ativos do usuário que casam com a
   * modalidade da atividade recém-aprovada. Chamado automaticamente de dentro de
   * ScoringService.creditPoints, na MESMA transação atômica do crédito de pontos.
   */
  public static async updateProgressForActivity(userId: string, activityId: string, tx: TransactionClient): Promise<void> {
    const activity = await tx.userActivity.findUnique({ where: { id: activityId } });
    if (!activity || activity.userId !== userId) return;

    const participants = await tx.challengeParticipant.findMany({
      where: {
        userId,
        completed: false,
        challenge: {
          status: { not: 'CANCELLED' },
          startDate: { lte: activity.activityDate },
          endDate: { gte: activity.activityDate },
          OR: [{ activityTypeId: null }, { activityTypeId: activity.activityTypeId }],
        },
      },
      include: { challenge: true },
    });

    for (const participant of participants) {
      const newProgress = participant.currentProgress + activity.quantity;
      const completed = newProgress >= participant.challenge.targetGoal;

      await tx.challengeParticipant.update({
        where: { id: participant.id },
        data: { currentProgress: newProgress, completed, completedAt: completed ? new Date() : null },
      });

      if (completed) {
        await this.awardCompletion(tx, userId, participant.challenge);
      }
    }
  }

  // ─── Consulta de progresso ──────────────────────────────────────────────────────

  public static async getMyProgress(challengeId: string, userId: string) {
    const participant = await prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
      include: { challenge: true },
    });
    if (!participant) {
      throw new NotFoundError('Você ainda não está participando deste desafio.');
    }
    return { ...participant, challenge: toPublicShape(participant.challenge) };
  }

  /** Leaderboard do desafio: participantes ordenados por progresso (empate: nome). */
  public static async listParticipants(challengeId: string) {
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundError(`Desafio com ID '${challengeId}' não foi encontrado.`);

    const participants = await prisma.challengeParticipant.findMany({
      where: { challengeId },
      include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true, department: { select: { id: true, name: true } } } } },
    });

    const sorted = participants
      .map((p) => ({
        userId: p.userId,
        name: p.user.name,
        avatarType: p.user.avatarType,
        avatarUrl: p.user.avatarUrl,
        department: p.user.department,
        currentProgress: p.currentProgress,
        targetGoal: challenge.targetGoal,
        completed: p.completed,
        completedAt: p.completedAt,
      }))
      .sort((a, b) => b.currentProgress - a.currentProgress || a.name.localeCompare(b.name, 'pt-BR'));

    return sorted.map((entry, index) => ({ position: index + 1, ...entry }));
  }

  /** Agrega o progresso por departamento — visão de "equipes" para desafios DEPARTMENT/COMPANY. */
  public static async listDepartmentProgress(challengeId: string) {
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundError(`Desafio com ID '${challengeId}' não foi encontrado.`);

    const participants = await prisma.challengeParticipant.findMany({
      where: { challengeId },
      include: { user: { select: { department: { select: { id: true, name: true } } } } },
    });

    const byDept = new Map<string, { departmentId: string; departmentName: string; totalProgress: number; participants: number }>();
    for (const p of participants) {
      const dept = p.user.department;
      const key = dept?.id ?? 'sem-departamento';
      const name = dept?.name ?? 'Sem departamento';
      const entry = byDept.get(key) ?? { departmentId: key, departmentName: name, totalProgress: 0, participants: 0 };
      entry.totalProgress += p.currentProgress;
      entry.participants += 1;
      byDept.set(key, entry);
    }

    return Array.from(byDept.values())
      .sort((a, b) => b.totalProgress - a.totalProgress || a.departmentName.localeCompare(b.departmentName, 'pt-BR'))
      .map((entry, index) => ({ position: index + 1, ...entry }));
  }
}
