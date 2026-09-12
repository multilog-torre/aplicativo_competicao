import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { tryParseJson } from '../../shared/utils/json';
import { TransactionClient } from '../../shared/types/prisma';
import { LevelService } from '../levels/level.service';
import { NotificationService } from '../notifications/notification.service';
import { RankingService } from '../ranking/ranking.service';
import { CreateAchievementDTO, UpdateAchievementDTO } from './achievement.dto';

/** Valida a forma de ruleValue de acordo com o ruleType — a coluna é um JSON string livre no banco. */
function assertValidRuleValue(ruleType: string, ruleValue: Record<string, unknown>): void {
  switch (ruleType) {
    case 'ACTIVITY_COUNT':
      if (typeof ruleValue.count !== 'number' || ruleValue.count <= 0) {
        throw new AppError("Para ACTIVITY_COUNT, ruleValue deve ser { count: number positivo }.", 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'TOTAL_POINTS':
      if (typeof ruleValue.minPoints !== 'number' || ruleValue.minPoints <= 0) {
        throw new AppError("Para TOTAL_POINTS, ruleValue deve ser { minPoints: number positivo }.", 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'STREAK_DAYS':
      if (typeof ruleValue.days !== 'number' || ruleValue.days <= 0) {
        throw new AppError("Para STREAK_DAYS, ruleValue deve ser { days: number positivo }.", 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'SPECIFIC_MODALITY':
      if (typeof ruleValue.activityTypeId !== 'string' || !ruleValue.activityTypeId) {
        throw new AppError(
          "Para SPECIFIC_MODALITY, ruleValue deve ser { activityTypeId: string, count?: number }.",
          422,
          'INVALID_RULE_VALUE',
        );
      }
      if (ruleValue.count !== undefined && (typeof ruleValue.count !== 'number' || ruleValue.count <= 0)) {
        throw new AppError('count, quando informado, deve ser um número positivo.', 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'CUMULATIVE_QUANTITY':
      if (typeof ruleValue.activityTypeId !== 'string' || !ruleValue.activityTypeId) {
        throw new AppError(
          'Para CUMULATIVE_QUANTITY, ruleValue deve ser { activityTypeId: string, targetQuantity: number positivo }.',
          422,
          'INVALID_RULE_VALUE',
        );
      }
      if (typeof ruleValue.targetQuantity !== 'number' || ruleValue.targetQuantity <= 0) {
        throw new AppError('targetQuantity deve ser um número positivo.', 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'DISTINCT_MODALITIES':
      if (typeof ruleValue.count !== 'number' || ruleValue.count <= 0) {
        throw new AppError('Para DISTINCT_MODALITIES, ruleValue deve ser { count: number positivo }.', 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'RANKING_POSITION':
      if (typeof ruleValue.maxPosition !== 'number' || ruleValue.maxPosition <= 0) {
        throw new AppError('Para RANKING_POSITION, ruleValue deve ser { maxPosition: number positivo }.', 422, 'INVALID_RULE_VALUE');
      }
      return;
    case 'ACCOUNT_TENURE_DAYS':
      if (typeof ruleValue.days !== 'number' || ruleValue.days <= 0) {
        throw new AppError('Para ACCOUNT_TENURE_DAYS, ruleValue deve ser { days: number positivo }.', 422, 'INVALID_RULE_VALUE');
      }
      return;
    default:
      throw new AppError(`ruleType desconhecido: '${ruleType}'`, 422, 'INVALID_RULE_TYPE');
  }
}

/** Pra ruleTypes ligados a uma modalidade específica, o `activityTypeId` que
 * já vive dentro do ruleValue JSON é a fonte de verdade avaliada pelo motor —
 * esta função só espelha esse mesmo valor na coluna de FK (usada só pra
 * filtro/agrupamento/documentação, nunca pela avaliação da regra). */
function resolveActivityTypeIdColumn(ruleType: string, ruleValue: Record<string, unknown>, explicit?: string): string | null {
  if (explicit) return explicit;
  if ((ruleType === 'SPECIFIC_MODALITY' || ruleType === 'CUMULATIVE_QUANTITY') && typeof ruleValue.activityTypeId === 'string') {
    return ruleValue.activityTypeId;
  }
  return null;
}

/** Maior sequência histórica de dias consecutivos (dedupe por dia de calendário). */
function computeMaxStreakDays(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const uniqueDaysMs = Array.from(
    new Set(dates.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())),
  ).sort((a, b) => a - b);

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < uniqueDaysMs.length; i++) {
    if (uniqueDaysMs[i] - uniqueDaysMs[i - 1] === ONE_DAY_MS) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

function toPublicShape<T extends { ruleValue: string }>(achievement: T) {
  return { ...achievement, ruleValue: tryParseJson(achievement.ruleValue) };
}

export class AchievementService {
  // ─── CRUD (configurável pelo administrador) ──────────────────────────────────

  public static async list() {
    const achievements = await prisma.achievement.findMany({ orderBy: { pointsReward: 'asc' } });
    return achievements.map(toPublicShape);
  }

  public static async getById(id: string) {
    const achievement = await prisma.achievement.findUnique({ where: { id } });
    if (!achievement) throw new NotFoundError(`Conquista com ID '${id}' não foi encontrada.`);
    return toPublicShape(achievement);
  }

  public static async create(dto: CreateAchievementDTO, adminId: string) {
    assertValidRuleValue(dto.ruleType, dto.ruleValue);

    const existing = await prisma.achievement.findFirst({ where: { name: dto.name } });
    if (existing) {
      throw new AppError(`Já existe uma conquista com o nome '${dto.name}'.`, 409, 'CONFLICT');
    }

    const activityTypeId = resolveActivityTypeIdColumn(dto.ruleType, dto.ruleValue, dto.activityTypeId);
    if (activityTypeId) {
      const activityType = await prisma.activityType.findUnique({ where: { id: activityTypeId } });
      if (!activityType) throw new NotFoundError(`Modalidade com ID '${activityTypeId}' não foi encontrada.`);
    }

    const created = await prisma.achievement.create({
      data: { ...dto, ruleValue: JSON.stringify(dto.ruleValue), activityTypeId },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CREATE',
        entity: 'Achievement',
        entityId: created.id,
        newValues: JSON.stringify(created),
      },
    });

    return toPublicShape(created);
  }

  public static async update(id: string, dto: UpdateAchievementDTO, adminId: string) {
    const existing = await prisma.achievement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Conquista com ID '${id}' não foi encontrada.`);

    const effectiveRuleType = dto.ruleType ?? existing.ruleType;
    const effectiveRuleValue = dto.ruleValue ?? (tryParseJson(existing.ruleValue) as Record<string, unknown>);
    if (dto.ruleType !== undefined || dto.ruleValue !== undefined) {
      assertValidRuleValue(effectiveRuleType, effectiveRuleValue);
    }

    if (dto.name && dto.name !== existing.name) {
      const conflict = await prisma.achievement.findFirst({ where: { name: dto.name, id: { not: id } } });
      if (conflict) throw new AppError(`Já existe outra conquista com o nome '${dto.name}'.`, 409, 'CONFLICT');
    }

    // Só recalcula a FK de modalidade quando algo que a afeta de fato mudou —
    // do contrário um PATCH parcial (ex.: só o nome) preservaria o valor atual.
    const activityTypeId =
      dto.ruleType !== undefined || dto.ruleValue !== undefined || dto.activityTypeId !== undefined
        ? resolveActivityTypeIdColumn(effectiveRuleType, effectiveRuleValue, dto.activityTypeId)
        : undefined;
    if (activityTypeId) {
      const activityType = await prisma.activityType.findUnique({ where: { id: activityTypeId } });
      if (!activityType) throw new NotFoundError(`Modalidade com ID '${activityTypeId}' não foi encontrada.`);
    }

    const updated = await prisma.achievement.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.ruleValue ? { ruleValue: JSON.stringify(dto.ruleValue) } : {}),
        ...(activityTypeId !== undefined ? { activityTypeId } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'Achievement',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return toPublicShape(updated);
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.achievement.findUnique({
      where: { id },
      include: { _count: { select: { userAchievements: true, pointsTransactions: true } } },
    });
    if (!existing) throw new NotFoundError(`Conquista com ID '${id}' não foi encontrada.`);

    const alreadyAwarded = existing._count.userAchievements > 0 || existing._count.pointsTransactions > 0;

    let status: 'DELETED' | 'DEACTIVATED';
    if (alreadyAwarded) {
      // Regra de ouro do ledger: nunca excluir algo já referenciado em points_transactions.
      await prisma.achievement.update({ where: { id }, data: { status: 'INACTIVE' } });
      status = 'DEACTIVATED';
    } else {
      await prisma.achievement.delete({ where: { id } });
      status = 'DELETED';
    }

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: status === 'DELETED' ? 'DELETE' : 'DEACTIVATE',
        entity: 'Achievement',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({ status }),
      },
    });

    return {
      status,
      message:
        status === 'DELETED'
          ? 'Conquista excluída com sucesso.'
          : 'Conquista já concedida a usuários — desativada em vez de excluída para preservar o histórico.',
    };
  }

  // ─── Consulta das conquistas desbloqueadas por um usuário ─────────────────────

  public static async listUnlockedForUser(userId: string, requestingUserId: string, isAdmin: boolean) {
    if (!isAdmin && userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar as conquistas de outro usuário.');
    }

    const unlocked = await prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
      include: { achievement: true },
    });

    return unlocked.map((ua) => ({
      id: ua.id,
      unlockedAt: ua.unlockedAt,
      achievement: toPublicShape(ua.achievement),
    }));
  }

  // ─── Verificação e desbloqueio automático (Fase 12) ───────────────────────────

  /**
   * Verifica todas as conquistas ainda não desbloqueadas pelo usuário e concede
   * as que já foram cumpridas. Chamado automaticamente de dentro de
   * ScoringService.creditPoints, na MESMA transação atômica de crédito de pontos.
   *
   * Escopo: cada conquista é avaliada uma única vez por chamada (sem encadear uma
   * segunda verificação após os pontos de recompensa serem creditados). Um combo
   * raro em que o prêmio de uma conquista cruza o limiar de outra só será
   * detectado na PRÓXIMA transação de pontos do usuário — decisão deliberada para
   * manter a lógica simples, previsível e livre de recursão.
   */
  public static async checkAndUnlock(userId: string, tx: TransactionClient): Promise<void> {
    const alreadyUnlocked = await tx.userAchievement.findMany({ where: { userId }, select: { achievementId: true } });
    const unlockedIds = new Set(alreadyUnlocked.map((u) => u.achievementId));

    const candidates = await tx.achievement.findMany({
      where: { status: 'ACTIVE', id: { notIn: Array.from(unlockedIds) } },
    });
    if (candidates.length === 0) return;

    const user = await tx.user.findUnique({ where: { id: userId }, select: { totalPoints: true, createdAt: true } });
    if (!user) return;

    // Dados usados por múltiplas regras — computados uma única vez por chamada.
    const approvedCount = await tx.userActivity.count({ where: { userId, status: 'APPROVED' } });

    // Recalculado a cada chamada (não cacheado) — como pointsAwarded pode
    // mudar entre uma conquista RANKING_POSITION e outra dentro do mesmo
    // loop (ex.: uma recompensa de pontos empurra a posição), reaproveitar um
    // valor antigo poderia avaliar a posição errada. RANKING_POSITION é raro
    // no catálogo (no máximo 2-3 conquistas), então o custo extra é mínimo.
    async function getLeaderboardPosition(): Promise<number | null> {
      const leaderboard = await RankingService.getGeneralLeaderboard(tx);
      const index = leaderboard.findIndex((entry) => entry.id === userId);
      return index === -1 ? null : index + 1;
    }

    let pointsAwarded = 0;

    for (const achievement of candidates) {
      const rule = tryParseJson(achievement.ruleValue) as Record<string, unknown>;
      let satisfied = false;

      switch (achievement.ruleType) {
        case 'ACTIVITY_COUNT':
          satisfied = approvedCount >= (rule.count as number);
          break;

        case 'TOTAL_POINTS':
          satisfied = user.totalPoints + pointsAwarded >= (rule.minPoints as number);
          break;

        case 'SPECIFIC_MODALITY': {
          const count = await tx.userActivity.count({
            where: { userId, status: 'APPROVED', activityTypeId: rule.activityTypeId as string },
          });
          satisfied = count >= ((rule.count as number) ?? 1);
          break;
        }

        case 'STREAK_DAYS': {
          const activities = await tx.userActivity.findMany({
            where: { userId, status: 'APPROVED' },
            select: { activityDate: true },
          });
          const maxStreak = computeMaxStreakDays(activities.map((a) => a.activityDate));
          satisfied = maxStreak >= (rule.days as number);
          break;
        }

        case 'CUMULATIVE_QUANTITY': {
          const agg = await tx.userActivity.aggregate({
            where: { userId, status: 'APPROVED', activityTypeId: rule.activityTypeId as string },
            _sum: { quantity: true },
          });
          satisfied = (agg._sum.quantity ?? 0) >= (rule.targetQuantity as number);
          break;
        }

        case 'DISTINCT_MODALITIES': {
          const grouped = await tx.userActivity.groupBy({
            by: ['activityTypeId'],
            where: { userId, status: 'APPROVED' },
          });
          satisfied = grouped.length >= (rule.count as number);
          break;
        }

        case 'RANKING_POSITION': {
          const position = await getLeaderboardPosition();
          satisfied = position !== null && position <= (rule.maxPosition as number);
          break;
        }

        case 'ACCOUNT_TENURE_DAYS': {
          const tenureDays = Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000));
          satisfied = tenureDays >= (rule.days as number);
          break;
        }
      }

      if (!satisfied) continue;

      await tx.userAchievement.create({ data: { userId, achievementId: achievement.id } });

      await NotificationService.create(
        {
          userId,
          title: 'Nova conquista desbloqueada! 🏆',
          message: `Você desbloqueou "${achievement.name}"!`,
          type: 'ACHIEVEMENT_UNLOCKED',
          referenceId: achievement.id,
        },
        tx,
      );

      if (achievement.pointsReward > 0) {
        await tx.pointsTransaction.create({
          data: {
            userId,
            achievementId: achievement.id,
            transactionType: 'ACHIEVEMENT',
            points: achievement.pointsReward,
            description: `Conquista desbloqueada: ${achievement.name}`,
          },
        });
        pointsAwarded += achievement.pointsReward;
      }
    }

    if (pointsAwarded > 0) {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: pointsAwarded } },
        select: { totalPoints: true },
      });
      // Os pontos de recompensa também podem cruzar um novo patamar de nível.
      await LevelService.recalculateForUser(userId, updatedUser.totalPoints, tx);
    }
    // Conquistas com pointsReward=0 já foram registradas em UserAchievement acima
    // e não afetam total_points nem nível.
  }
}
