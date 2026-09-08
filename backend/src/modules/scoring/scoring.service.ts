import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { TransactionClient } from '../../shared/types/prisma';
import { AchievementService } from '../achievements/achievement.service';
import { ChallengeService } from '../challenges/challenge.service';
import { LevelService } from '../levels/level.service';
import { NotificationService } from '../notifications/notification.service';
import { RankingService } from '../ranking/ranking.service';
import { ListTransactionsQueryDTO, ManualTransactionDTO, ReversalDTO, SimulateScoreDTO } from './scoring.dto';

// ─── Tipos internos ───────────────────────────────────────────────────────────
export interface ScoreCalculationResult {
  activityTypeId: string;
  activityTypeName: string;
  scoringType: string;
  quantity: number;
  unit: string | null;
  basePoints: number;
  multiplier: number;
  calculatedPoints: number;
  breakdown: string;
  limitWarning?: string;
}

// ─── Motor de Pontuação Oficial ───────────────────────────────────────────────
export class ScoringService {
  /**
   * Calcula a pontuação oficial com base nas regras da modalidade.
   * Este método é a ÚNICA fonte de verdade de cálculo de pontos — nunca o frontend.
   */
  public static calculatePoints(
    scoringType: string,
    quantity: number,
    basePoints: number,
    multiplier: number,
  ): { points: number; breakdown: string } {
    switch (scoringType) {
      case 'FIXED': {
        // 1 atividade = X pontos fixos (quantidade não interfere no cálculo)
        return {
          points: basePoints,
          breakdown: `FIXED: ${basePoints} pts (valor fixo independente da quantidade)`,
        };
      }

      case 'QUANTITY': {
        // Ex: 5 km = 50 pts → 7.5 km = 75 pts (basePoints por unidade)
        const points = Math.round(quantity * basePoints);
        return {
          points,
          breakdown: `QUANTITY: ${quantity} × ${basePoints} pts/unidade = ${points} pts`,
        };
      }

      case 'TIME': {
        // Ex: 30 minutos = 30 pts → basePoints por minuto/unidade de tempo
        const points = Math.round(quantity * basePoints);
        return {
          points,
          breakdown: `TIME: ${quantity} × ${basePoints} pts/min = ${points} pts`,
        };
      }

      case 'MULTIPLIER': {
        // Ex: quantidade × multiplicador personalizado
        const points = Math.round(quantity * multiplier);
        return {
          points,
          breakdown: `MULTIPLIER: ${quantity} × ${multiplier} = ${points} pts`,
        };
      }

      default:
        throw new AppError(`Tipo de pontuação desconhecido: '${scoringType}'`, 400, 'INVALID_SCORING_TYPE');
    }
  }

  /**
   * Verifica se o usuário ainda está dentro dos limites diários/semanais/mensais
   * da modalidade antes de aprovar uma atividade.
   */
  public static async checkLimits(
    userId: string,
    activityTypeId: string,
    activityDate: Date,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const activityType = await prisma.activityType.findUnique({
      where: { id: activityTypeId },
      select: {
        dailyLimit: true,
        weeklyLimit: true,
        monthlyLimit: true,
      },
    });

    if (!activityType) {
      throw new NotFoundError(`Modalidade com ID '${activityTypeId}' não encontrada.`);
    }

    const { dailyLimit, weeklyLimit, monthlyLimit } = activityType;

    // Se nenhum limite configurado, libera
    if (!dailyLimit && !weeklyLimit && !monthlyLimit) {
      return { allowed: true };
    }

    const startOfDay = new Date(activityDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(activityDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Calcula início da semana (segunda-feira)
    const dayOfWeek = activityDate.getDay(); // 0=dom, 1=seg ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(activityDate);
    startOfWeek.setDate(activityDate.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Calcula início/fim do mês
    const startOfMonth = new Date(activityDate.getFullYear(), activityDate.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(activityDate.getFullYear(), activityDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Conta atividades APROVADAS (APPROVED) no período, para a mesma modalidade e usuário
    const [dailyCount, weeklyCount, monthlyCount] = await Promise.all([
      dailyLimit
        ? prisma.userActivity.count({
            where: {
              userId,
              activityTypeId,
              status: 'APPROVED',
              activityDate: { gte: startOfDay, lte: endOfDay },
            },
          })
        : Promise.resolve(0),

      weeklyLimit
        ? prisma.userActivity.count({
            where: {
              userId,
              activityTypeId,
              status: 'APPROVED',
              activityDate: { gte: startOfWeek, lte: endOfWeek },
            },
          })
        : Promise.resolve(0),

      monthlyLimit
        ? prisma.userActivity.count({
            where: {
              userId,
              activityTypeId,
              status: 'APPROVED',
              activityDate: { gte: startOfMonth, lte: endOfMonth },
            },
          })
        : Promise.resolve(0),
    ]);

    if (dailyLimit && dailyCount >= dailyLimit) {
      return {
        allowed: false,
        reason: `Limite diário de ${dailyLimit} atividade(s) nesta modalidade já foi atingido para esta data.`,
      };
    }

    if (weeklyLimit && weeklyCount >= weeklyLimit) {
      return {
        allowed: false,
        reason: `Limite semanal de ${weeklyLimit} atividade(s) nesta modalidade já foi atingido para esta semana.`,
      };
    }

    if (monthlyLimit && monthlyCount >= monthlyLimit) {
      return {
        allowed: false,
        reason: `Limite mensal de ${monthlyLimit} atividade(s) nesta modalidade já foi atingido para este mês.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Simula (preview) a pontuação de uma atividade antes de submetê-la.
   * Não cria registros no banco — apenas calcula e informa os limites.
   */
  public static async simulate(dto: SimulateScoreDTO, userId: string): Promise<ScoreCalculationResult> {
    const activityType = await prisma.activityType.findUnique({
      where: { id: dto.activityTypeId },
    });

    if (!activityType) {
      throw new NotFoundError(`Modalidade com ID '${dto.activityTypeId}' não encontrada.`);
    }

    if (activityType.status !== 'ACTIVE') {
      throw new AppError('Esta modalidade está inativa e não aceita novas atividades.', 422, 'MODALITY_INACTIVE');
    }

    const { points, breakdown } = this.calculatePoints(
      activityType.scoringType,
      dto.quantity,
      activityType.basePoints,
      activityType.multiplier,
    );

    // Verifica limites usando a data de hoje para a simulação
    const limitCheck = await this.checkLimits(userId, dto.activityTypeId, new Date());

    return {
      activityTypeId: activityType.id,
      activityTypeName: activityType.name,
      scoringType: activityType.scoringType,
      quantity: dto.quantity,
      unit: activityType.unit,
      basePoints: activityType.basePoints,
      multiplier: activityType.multiplier,
      calculatedPoints: points,
      breakdown,
      ...(limitCheck.allowed
        ? {}
        : { limitWarning: limitCheck.reason }),
    };
  }

  /**
   * Registra uma transação de pontos (ACTIVITY, BONUS, PENALTY, ADJUSTMENT, REVERSAL, etc.)
   * e atualiza o total do usuário atomicamente via transação ACID.
   * REGRA DE OURO: Nunca fazer UPDATE direto em points_transactions. Apenas INSERT.
   *
   * Aceita opcionalmente um `externalTx` — o cliente de transação de um
   * `prisma.$transaction` já aberto pelo chamador (ex.: aprovação de atividade,
   * planejamento.md §32), para que o crédito de pontos participe da MESMA
   * transação atômica em vez de abrir uma transação aninhada própria.
   */
  public static async creditPoints(
    params: {
      userId: string;
      points: number;
      transactionType: string;
      description: string;
      createdBy?: string;
      activityId?: string;
      challengeId?: string;
      achievementId?: string;
      rewardId?: string;
      referenceType?: string;
      referenceId?: string;
    },
    externalTx?: TransactionClient,
  ) {
    const run = async (tx: TransactionClient) => {
      // Verifica se o usuário existe
      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundError(`Usuário com ID '${params.userId}' não encontrado.`);

      // Posição ANTES do crédito — usada para detectar "subida no ranking" (Fase 16).
      // Restrito a atividades aprovadas (evento mais significativo) para não
      // recalcular o ranking inteiro a cada micro-ajuste manual de pontos.
      const shouldCheckRankingChange = params.transactionType === 'ACTIVITY' && params.points > 0;
      const positionBefore = shouldCheckRankingChange ? await RankingService.getGeneralPosition(params.userId, tx) : null;

      // 1. Cria a transação imutável no ledger
      const transaction = await tx.pointsTransaction.create({
        data: {
          userId: params.userId,
          points: params.points,
          transactionType: params.transactionType,
          description: params.description,
          createdBy: params.createdBy ?? null,
          activityId: params.activityId ?? null,
          challengeId: params.challengeId ?? null,
          achievementId: params.achievementId ?? null,
          rewardId: params.rewardId ?? null,
          referenceType: params.referenceType ?? null,
          referenceId: params.referenceId ?? null,
        },
      });

      // 2. Atualiza o total agregado do usuário (pode ser positivo ou negativo)
      const updatedUser = await tx.user.update({
        where: { id: params.userId },
        data: { totalPoints: { increment: params.points } },
        select: { id: true, totalPoints: true },
      });

      // 3. Reclassifica o nível do usuário com base no novo total (Fase 11) —
      // dentro da MESMA transação atômica do crédito de pontos (planejamento.md §32).
      await LevelService.recalculateForUser(params.userId, updatedUser.totalPoints, tx);

      // 4. Verifica e desbloqueia conquistas automaticamente (Fase 12) — mesma transação.
      await AchievementService.checkAndUnlock(params.userId, tx);

      // 5. Atualiza o progresso de desafios ativos (Fase 13) — apenas para créditos
      // originados de uma atividade aprovada (transactionType=ACTIVITY com activityId).
      if (params.transactionType === 'ACTIVITY' && params.activityId) {
        await ChallengeService.updateProgressForActivity(params.userId, params.activityId, tx);
      }

      // 6. Notifica subida no ranking geral, se aplicável (Fase 16).
      if (shouldCheckRankingChange && positionBefore !== null) {
        const positionAfter = await RankingService.getGeneralPosition(params.userId, tx);
        if (positionAfter !== null && positionAfter < positionBefore) {
          await NotificationService.create(
            {
              userId: params.userId,
              title: 'Você subiu no ranking! 📈',
              message: `Você passou da posição ${positionBefore}ª para a ${positionAfter}ª no ranking geral.`,
              type: 'RANKING_UP',
            },
            tx,
          );
        }
      }

      return { transaction, newTotalPoints: updatedUser.totalPoints };
    };

    return externalTx ? run(externalTx) : prisma.$transaction(run);
  }

  /**
   * Lançamento manual de pontos pelo administrador (BONUS, PENALTY ou ADJUSTMENT).
   */
  public static async manualTransaction(dto: ManualTransactionDTO, adminId: string) {
    // Verifica se o usuário alvo existe
    const targetUser = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, totalPoints: true },
    });

    if (!targetUser) {
      throw new NotFoundError(`Usuário com ID '${dto.userId}' não encontrado.`);
    }

    // Pontuação negativa para PENALTY
    const points = dto.transactionType === 'PENALTY' ? -Math.abs(dto.points) : dto.points;

    const result = await this.creditPoints({
      userId: dto.userId,
      points,
      transactionType: dto.transactionType,
      description: dto.description,
      createdBy: adminId,
    });

    // Registra na auditoria
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'MANUAL_POINTS',
        entity: 'PointsTransaction',
        entityId: result.transaction.id,
        newValues: JSON.stringify({
          targetUserId: dto.userId,
          targetUserName: targetUser.name,
          transactionType: dto.transactionType,
          points,
          description: dto.description,
          previousTotal: targetUser.totalPoints,
          newTotal: result.newTotalPoints,
        }),
      },
    });

    // Notifica o usuário sobre o ajuste de pontos (Fase 16).
    await NotificationService.create({
      userId: dto.userId,
      title: points >= 0 ? 'Você recebeu pontos! 🎁' : 'Ajuste em sua pontuação',
      message: `${dto.description} (${points >= 0 ? '+' : ''}${points} pontos)`,
      type: 'POINTS_ADJUSTED',
      referenceId: result.transaction.id,
    });

    return {
      transaction: result.transaction,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        previousTotal: targetUser.totalPoints,
        newTotal: result.newTotalPoints,
      },
    };
  }

  /**
   * Reverte uma transação de pontos existente.
   * NUNCA deleta o registro original — cria uma transação REVERSAL que cancela o efeito.
   *
   * Aceita opcionalmente um `externalTx` (mesmo padrão de creditPoints) para que a
   * reversão participe da transação atômica de um fluxo maior — ex.: cancelamento
   * de resgate de premiação com estorno automático (Fase 14).
   */
  public static async reverseTransaction(
    transactionId: string,
    dto: ReversalDTO,
    adminId: string,
    externalTx?: TransactionClient,
  ) {
    const run = async (tx: TransactionClient) => {
      const original = await tx.pointsTransaction.findUnique({
        where: { id: transactionId },
        include: { user: { select: { id: true, name: true, totalPoints: true } } },
      });

      if (!original) {
        throw new NotFoundError(`Transação com ID '${transactionId}' não encontrada.`);
      }

      // Verifica se já existe uma reversão para esta transação
      const alreadyReversed = await tx.pointsTransaction.findFirst({
        where: {
          transactionType: 'REVERSAL',
          referenceId: transactionId,
        },
      });

      if (alreadyReversed) {
        throw new AppError('Esta transação já foi revertida anteriormente.', 409, 'ALREADY_REVERSED');
      }

      // Impede reversão de reversões
      if (original.transactionType === 'REVERSAL') {
        throw new AppError('Não é possível reverter uma transação de reversão.', 422, 'CANNOT_REVERSE_REVERSAL');
      }

      const reversalPoints = -original.points; // Inverte o sinal para cancelar o efeito

      const result = await this.creditPoints(
        {
          userId: original.userId,
          points: reversalPoints,
          transactionType: 'REVERSAL',
          description: `[REVERSÃO] ${dto.reason} (original: ${original.description})`,
          createdBy: adminId,
          referenceType: 'PointsTransaction',
          referenceId: transactionId,
        },
        tx,
      );

      // Registra na auditoria
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'REVERSAL',
          entity: 'PointsTransaction',
          entityId: result.transaction.id,
          oldValues: JSON.stringify({ originalTransactionId: transactionId, originalPoints: original.points }),
          newValues: JSON.stringify({
            reversalTransactionId: result.transaction.id,
            reversalPoints,
            reason: dto.reason,
            newTotal: result.newTotalPoints,
          }),
        },
      });

      // Notifica o usuário sobre o estorno (Fase 16).
      await NotificationService.create(
        {
          userId: original.userId,
          title: 'Ajuste em sua pontuação',
          message: `Uma transação foi revertida: ${dto.reason} (${reversalPoints >= 0 ? '+' : ''}${reversalPoints} pontos)`,
          type: 'POINTS_ADJUSTED',
          referenceId: result.transaction.id,
        },
        tx,
      );

      return {
        originalTransaction: original,
        reversalTransaction: result.transaction,
        targetUser: {
          id: original.user.id,
          name: original.user.name,
          previousTotal: original.user.totalPoints,
          newTotal: result.newTotalPoints,
        },
      };
    };

    return externalTx ? run(externalTx) : prisma.$transaction(run);
  }

  /**
   * Lista o histórico de transações de pontos com filtros e paginação.
   */
  public static async listTransactions(query: ListTransactionsQueryDTO, requestingUserId: string, isAdmin: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Participantes só podem ver o próprio histórico
    const userId = isAdmin ? query.userId : requestingUserId;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (query.transactionType) where.transactionType = query.transactionType;

    const [total, transactions] = await Promise.all([
      prisma.pointsTransaction.count({ where }),
      prisma.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detalhe de uma transação de pontos, com a ORIGEM completamente resolvida
   * conforme o tipo (Fase 19 — "Histórico do Usuário", funcionalidade
   * obrigatória do planejamento.md: "o usuário consegue identificar
   * exatamente de onde veio cada ponto"). Diferente de `listTransactions`
   * (linha flat da tabela), aqui a atividade/conquista/desafio/premiação
   * relacionada é expandida com seus próprios detalhes — ex.: para uma
   * atividade, inclui modalidade, quantidade, quem aprovou e quando.
   */
  public static async getTransactionDetail(id: string, requestingUserId: string, isAdmin: boolean) {
    const transaction = await prisma.pointsTransaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        activity: {
          include: {
            activityType: { select: { name: true, icon: true } },
            validator: { select: { id: true, name: true } },
          },
        },
        achievement: { select: { id: true, name: true, description: true, icon: true } },
        challenge: { select: { id: true, title: true } },
        reward: { select: { id: true, title: true } },
      },
    });

    if (!transaction) {
      throw new NotFoundError(`Transação com ID '${id}' não foi encontrada.`);
    }

    if (!isAdmin && transaction.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar a transação de outro usuário.');
    }

    let origin: Record<string, unknown> | null;

    switch (transaction.transactionType) {
      case 'ACTIVITY':
        origin = transaction.activity
          ? {
              type: 'ACTIVITY',
              activityId: transaction.activity.id,
              activityTypeName: transaction.activity.activityType.name,
              icon: transaction.activity.activityType.icon,
              quantity: transaction.activity.quantity,
              unit: transaction.activity.unit,
              activityDate: transaction.activity.activityDate,
              approvedBy: transaction.activity.validator
                ? { id: transaction.activity.validator.id, name: transaction.activity.validator.name }
                : null,
              approvedAt: transaction.activity.validatedAt,
            }
          : null;
        break;

      case 'BONUS':
      case 'PENALTY':
      case 'ADJUSTMENT':
        origin = {
          type: transaction.transactionType,
          grantedBy: transaction.creator ? { id: transaction.creator.id, name: transaction.creator.name } : null,
        };
        break;

      case 'ACHIEVEMENT':
        origin = transaction.achievement
          ? {
              type: 'ACHIEVEMENT',
              achievementId: transaction.achievement.id,
              achievementName: transaction.achievement.name,
              description: transaction.achievement.description,
              icon: transaction.achievement.icon,
            }
          : null;
        break;

      case 'CHALLENGE':
        origin = transaction.challenge
          ? { type: 'CHALLENGE', challengeId: transaction.challenge.id, challengeTitle: transaction.challenge.title }
          : null;
        break;

      case 'REWARD':
        origin = transaction.reward
          ? {
              type: 'REWARD',
              rewardId: transaction.reward.id,
              rewardTitle: transaction.reward.title,
              redemptionId: transaction.referenceId,
            }
          : null;
        break;

      case 'REVERSAL': {
        const reversedTransaction = transaction.referenceId
          ? await prisma.pointsTransaction.findUnique({
              where: { id: transaction.referenceId },
              select: { id: true, points: true, description: true, transactionType: true },
            })
          : null;
        origin = {
          type: 'REVERSAL',
          reversedTransactionId: transaction.referenceId,
          reversedTransaction,
          revertedBy: transaction.creator ? { id: transaction.creator.id, name: transaction.creator.name } : null,
        };
        break;
      }

      default:
        origin = { type: transaction.transactionType };
    }

    return {
      id: transaction.id,
      points: transaction.points,
      transactionType: transaction.transactionType,
      description: transaction.description,
      createdAt: transaction.createdAt,
      user: transaction.user,
      origin,
    };
  }
}
