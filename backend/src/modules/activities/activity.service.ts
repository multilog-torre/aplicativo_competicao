import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { AdminActivityService } from '../admin/admin-activity.service';
import { ChallengeService } from '../challenges/challenge.service';
import { ScoringService } from '../scoring/scoring.service';
import { SettingsService } from '../settings/settings.service';
import { getStorageProvider } from '../storage/storage.factory';
import { TransactionClient } from '../../shared/types/prisma';
import { CreateActivityDTO, ListActivitiesQueryDTO, UpdateActivityDTO } from './activity.dto';

const ACTIVITY_WITH_TYPE_INCLUDE = {
  activityType: {
    select: { id: true, name: true, icon: true, unit: true, requiresEvidence: true, allowedFileTypes: true },
  },
} as const;

export class ActivityService {
  /**
   * Registra uma nova atividade. O cálculo de pontos é feito aqui
   * (calculatedPoints) — apenas o backend decide isso (planejamento.md §5.1).
   *
   * A atividade sempre NASCE como PENDING; nenhum points_transaction é
   * criado ainda nesta função. O que acontece a partir daí depende da
   * configuração "Aprovação automática de atividades" (settings.service.ts,
   * decisão de negócio a pedido do usuário — padrão ATIVADO):
   *
   * - Modalidade NÃO exige evidência + auto-aprovação ativa: aprova sozinha
   *   agora mesmo, via AdminActivityService.approve(id, null) — mesmo motor
   *   de pontos/nível/conquistas/desafios da aprovação manual, só que sem
   *   nenhum humano por trás (auditado como AUTO_APPROVE_ACTIVITY).
   * - Modalidade EXIGE evidência: nunca aprova aqui, mesmo com a
   *   configuração ativa — não existe evidência anexada ainda neste ponto
   *   (ela só chega numa chamada separada, `POST /activities/:id/evidence`).
   *   Quem decide se aprova depois de a evidência chegar é
   *   EvidenceService.upload.
   * - Auto-aprovação desativada: comportamento de sempre — fica PENDING até
   *   um administrador aprovar/rejeitar manualmente (Admin > Aprovações).
   */
  public static async create(dto: CreateActivityDTO, userId: string) {
    const activityType = await prisma.activityType.findUnique({
      where: { id: dto.activityTypeId },
    });

    if (!activityType) {
      throw new NotFoundError(`Modalidade com ID '${dto.activityTypeId}' não foi encontrada.`);
    }

    if (activityType.status !== 'ACTIVE') {
      throw new AppError('Esta modalidade está inativa e não aceita novas atividades.', 422, 'MODALITY_INACTIVE');
    }

    // Só deixa registrar atividade NOVA se houver um ciclo de premiação
    // ACTIVE agora (a pedido do usuário) — evita a confusão de alguém
    // registrar algo num intervalo sem ciclo nenhum rolando, cujos pontos
    // nunca vão contar pro placar de competição (ver ciclos.md). Vale pra
    // TODO mundo, sem exceção de papel (admin também participa). Só afeta
    // a CRIAÇÃO — uma atividade já pendente de antes continua podendo ser
    // aprovada normalmente mesmo sem ciclo ativo (regra separada, já
    // existente: o crédito só não conta pro placar, mas a aprovação em si
    // não é bloqueada).
    //
    // Consulta direta (sem CycleService.getCurrent()) de propósito: aquele
    // método chama checkAndCloseExpiredCycles() antes de ler, fechando
    // qualquer ciclo vencido como efeito colateral — pesado demais só pra
    // essa checagem de existência, e fecharia ciclos vencidos mais cedo do
    // que o resto do sistema tolera (mesma folga que já existe em
    // "COMPLETED é um estado transitório", ciclos.md). O verificador
    // periódico (server.ts, 5 em 5 min) continua sendo quem de fato fecha.
    const activeCycleNow = await prisma.awardCycle.findFirst({
      where: { status: 'ACTIVE', startDate: { lte: new Date() }, endDate: { gte: new Date() } },
      select: { id: true },
    });
    if (!activeCycleNow) {
      throw new AppError(
        'Não é possível registrar atividades fora de um período de ciclo ativo. Aguarde o início do próximo ciclo.',
        422,
        'NO_ACTIVE_CYCLE',
      );
    }

    const activityDate = new Date(dto.activityDate);

    // Verifica limites diários/semanais/mensais configurados na modalidade
    // (considera apenas atividades já APROVADAS, conforme regra do motor de pontuação)
    const limitCheck = await ScoringService.checkLimits(userId, dto.activityTypeId, activityDate);
    if (!limitCheck.allowed) {
      throw new AppError(limitCheck.reason ?? 'Limite da modalidade atingido.', 422, 'LIMIT_EXCEEDED');
    }

    // Cálculo oficial de pontos — apenas o backend decide isso (planejamento.md §5.1)
    const { points } = ScoringService.calculatePoints(
      activityType.scoringType,
      dto.quantity,
      activityType.basePoints,
      activityType.multiplier,
    );

    const activity = await prisma.userActivity.create({
      data: {
        userId,
        activityTypeId: dto.activityTypeId,
        activityDate,
        quantity: dto.quantity,
        unit: activityType.unit,
        description: dto.description,
        calculatedPoints: points,
        status: 'PENDING',
      },
      include: ACTIVITY_WITH_TYPE_INCLUDE,
    });

    if (!activityType.requiresEvidence && (await SettingsService.isAutoApproveActivitiesEnabled())) {
      await AdminActivityService.approve(activity.id, null);
      return prisma.userActivity.findUniqueOrThrow({ where: { id: activity.id }, include: ACTIVITY_WITH_TYPE_INCLUDE });
    }

    return activity;
  }

  /**
   * Lista atividades com filtros e paginação.
   * Participantes só podem ver as próprias atividades — nunca de outros usuários.
   */
  public static async list(query: ListActivitiesQueryDTO, requestingUserId: string, isAdmin: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const userId = isAdmin ? query.userId : requestingUserId;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (query.activityTypeId) where.activityTypeId = query.activityTypeId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.activityDate = {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      };
    }

    const [total, activities] = await Promise.all([
      prisma.userActivity.count({ where }),
      prisma.userActivity.findMany({
        where,
        orderBy: { activityDate: 'desc' },
        skip,
        take: limit,
        include: {
          activityType: { select: { id: true, name: true, icon: true, unit: true } },
          user: { select: { id: true, name: true } },
          validator: { select: { id: true, name: true } },
          // Só id/fileType — nunca storagePath/storageUrl brutos (mesma regra da Fase 7).
          // O calendário de registros (Meu Perfil) usa isso para mostrar a fotinho do dia.
          evidences: { select: { id: true, fileType: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
      }),
    ]);

    return {
      activities: activities.map((a) => {
        const { evidences, ...rest } = a;
        return {
          ...rest,
          evidences: evidences.map((e) => ({
            id: e.id,
            fileType: e.fileType,
            downloadUrl: `/api/v1/activities/${a.id}/evidence/${e.id}/download`,
          })),
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca uma atividade por ID.
   * Participantes só podem visualizar as próprias atividades.
   */
  public static async getById(id: string, requestingUserId: string, isAdmin: boolean) {
    const activity = await prisma.userActivity.findUnique({
      where: { id },
      include: {
        activityType: true,
        user: { select: { id: true, name: true, email: true } },
        validator: { select: { id: true, name: true } },
        evidences: true,
        pointsTransactions: true,
      },
    });

    if (!activity) {
      throw new NotFoundError(`Atividade com ID '${id}' não foi encontrada.`);
    }

    if (!isAdmin && activity.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar a atividade de outro usuário.');
    }

    // Nunca expor storagePath/storageUrl brutos — o acesso ao arquivo é sempre
    // mediado pelo endpoint autorizado de download (Fase 7).
    const { evidences, ...rest } = activity;
    return {
      ...rest,
      evidences: evidences.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        fileType: e.fileType,
        fileSize: e.fileSize,
        createdAt: e.createdAt,
        downloadUrl: `/api/v1/activities/${activity.id}/evidence/${e.id}/download`,
      })),
    };
  }

  /** `quantidade unidade` (ex.: "5 km") ou só `quantidade` se a modalidade não tiver unidade. */
  private static quantityLabel(unit: string | null, quantity: number): string {
    return unit ? `${quantity} ${unit}` : `${quantity}`;
  }

  /**
   * Trava de editar/excluir atividade já APROVADA (a pedido do usuário): só
   * permite se o ciclo em que ela pontuou ainda estiver ACTIVE — não mexe no
   * placar de um ciclo já encerrado/premiado. Se a atividade nunca chegou a
   * contar pra nenhum ciclo (`cycleId` nulo — foi aprovada num intervalo sem
   * ciclo ativo), não tem essa trava, porque nunca afetou placar nenhum.
   */
  private static async assertCycleStillEditable(cycleId: string | null): Promise<void> {
    if (!cycleId) return;
    const cycle = await prisma.awardCycle.findUnique({ where: { id: cycleId }, select: { status: true } });
    if (!cycle || cycle.status !== 'ACTIVE') {
      throw new AppError(
        'Não é possível editar ou excluir esta atividade — o ciclo em que ela pontuou já foi encerrado.',
        422,
        'CYCLE_ALREADY_CLOSED',
      );
    }
  }

  /**
   * Acha a transação mais recente que bate com o filtro e que AINDA não foi
   * revertida — nunca a primeira que aparecer. Uma atividade/desafio pode
   * ter várias transações do mesmo tipo ao longo de edições sucessivas (uma
   * reverte a anterior, outra credita de novo), então `findFirst` sem
   * ordenação explícita arrisca pegar uma já revertida (bug real encontrado
   * ao testar: editar a mesma atividade duas vezes seguidas tentava
   * reverter a transação antiga de novo, "ALREADY_REVERSED").
   */
  private static async findLatestUnreversedTransaction(
    tx: TransactionClient,
    where: { activityId?: string; userId?: string; challengeId?: string; transactionType: string },
  ) {
    const candidates = await tx.pointsTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (candidates.length === 0) return null;

    const reversals = await tx.pointsTransaction.findMany({
      where: { transactionType: 'REVERSAL', referenceId: { in: candidates.map((c) => c.id) } },
      select: { referenceId: true },
    });
    const reversedIds = new Set(reversals.map((r) => r.referenceId));

    return candidates.find((c) => !reversedIds.has(c.id)) ?? null;
  }

  /**
   * Reverte o prêmio de conclusão de cada desafio "descompletado" por uma
   * edição/exclusão (lista devolvida por `ChallengeService.undoProgressForActivity`)
   * — fica aqui, não em ChallengeService, pra evitar import circular
   * (ScoringService já importa ChallengeService).
   */
  private static async reverseChallengeRewardsIfAny(
    userId: string,
    toReverse: Array<{ challengeId: string; title: string }>,
    activityId: string,
    actionLabel: 'editada' | 'excluída',
    tx: TransactionClient,
  ): Promise<void> {
    for (const { challengeId, title } of toReverse) {
      // Pode haver mais de uma transação CHALLENGE pra este par (completou,
      // uma edição descompletou e reverteu, outra edição completou de novo
      // — cada ciclo gera uma transação nova). Pega a mais recente que
      // AINDA não foi revertida — nunca a primeira que aparecer.
      const rewardTx = await this.findLatestUnreversedTransaction(tx, { userId, challengeId, transactionType: 'CHALLENGE' });
      if (!rewardTx) continue;

      await ScoringService.reverseTransaction(
        rewardTx.id,
        { reason: `Desafio "${title}" descompletado — atividade de origem (#${activityId.slice(0, 8)}) foi ${actionLabel}` },
        userId,
        tx,
      );
    }
  }

  /**
   * Edita uma atividade já registrada — a pedido do usuário (corrigir
   * quantidade/data/descrição digitada errada). A modalidade NUNCA muda
   * aqui (ver UpdateActivitySchema) — trocar de modalidade é registrar uma
   * atividade nova.
   *
   * - `PENDING`: edição livre, nada foi creditado ainda.
   * - `APPROVED`: reverte o crédito antigo (pontos + progresso de desafio
   *   que ela alimentou) e credita de novo com os valores corrigidos —
   *   mesmo motor de sempre, já dispara conquistas/desafio/nível
   *   automaticamente. Só permitido se o ciclo em que ela pontuou ainda
   *   estiver ACTIVE (`assertCycleStillEditable`). Conquistas já
   *   desbloqueadas por ela permanecem — vitalícias, nunca revogadas
   *   (mesma regra de sempre, ver conquistas.md).
   * - `REJECTED`/`CANCELLED`: não pode editar.
   */
  public static async update(id: string, dto: UpdateActivityDTO, userId: string) {
    const activity = await prisma.userActivity.findUnique({ where: { id }, include: { activityType: true } });
    if (!activity) throw new NotFoundError(`Atividade com ID '${id}' não foi encontrada.`);
    if (activity.userId !== userId) {
      throw new ForbiddenError('Você só pode editar as próprias atividades.');
    }

    if (activity.status === 'REJECTED' || activity.status === 'CANCELLED') {
      throw new AppError(
        `Não é possível editar uma atividade ${activity.status === 'REJECTED' ? 'rejeitada' : 'cancelada'}.`,
        422,
        'ACTIVITY_NOT_EDITABLE',
      );
    }

    const newQuantity = dto.quantity ?? activity.quantity;
    const newActivityDate = dto.activityDate ? new Date(dto.activityDate) : activity.activityDate;
    const newDescription = dto.description !== undefined ? dto.description : activity.description;

    const { points: newCalculatedPoints } = ScoringService.calculatePoints(
      activity.activityType.scoringType,
      newQuantity,
      activity.activityType.basePoints,
      activity.activityType.multiplier,
    );

    // Reconfere limites com os valores novos, excluindo a própria atividade
    // da contagem (senão ela se contaria contra o próprio limite).
    const limitCheck = await ScoringService.checkLimits(userId, activity.activityTypeId, newActivityDate, activity.id);
    if (!limitCheck.allowed) {
      throw new AppError(limitCheck.reason ?? 'Limite da modalidade atingido.', 422, 'LIMIT_EXCEEDED');
    }

    const oldValuesLog = {
      quantity: activity.quantity,
      activityDate: activity.activityDate,
      description: activity.description,
      calculatedPoints: activity.calculatedPoints,
    };
    const newValuesLog = {
      quantity: newQuantity,
      activityDate: newActivityDate,
      description: newDescription,
      calculatedPoints: newCalculatedPoints,
    };

    if (activity.status === 'PENDING') {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.userActivity.update({
          where: { id },
          data: {
            quantity: newQuantity,
            activityDate: newActivityDate,
            description: newDescription,
            calculatedPoints: newCalculatedPoints,
          },
          include: ACTIVITY_WITH_TYPE_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EDIT_ACTIVITY',
            entity: 'UserActivity',
            entityId: id,
            oldValues: JSON.stringify(oldValuesLog),
            newValues: JSON.stringify(newValuesLog),
          },
        });

        return result;
      });

      return updated;
    }

    // APPROVED: precisa reverter o crédito antigo (pontos + desafio) e recreditar com os valores novos.
    const originalTransactionPreview = await this.findLatestUnreversedTransaction(prisma, {
      activityId: id,
      transactionType: 'ACTIVITY',
    });
    await this.assertCycleStillEditable(originalTransactionPreview?.cycleId ?? null);

    await prisma.$transaction(async (tx) => {
      const toReverseReward = await ChallengeService.undoProgressForActivity(
        userId,
        {
          activityTypeId: activity.activityTypeId,
          activityDate: activity.activityDate,
          quantity: activity.quantity,
          validatedAt: activity.validatedAt,
        },
        tx,
      );
      await this.reverseChallengeRewardsIfAny(userId, toReverseReward, id, 'editada', tx);

      // Reconsulta DENTRO da transação (a checagem acima foi só pra travar
      // cedo, fora da transação) — garante que nenhuma outra edição
      // concorrente mudou o estado entre a checagem e aqui.
      const originalTransaction = await this.findLatestUnreversedTransaction(tx, { activityId: id, transactionType: 'ACTIVITY' });
      if (originalTransaction) {
        await ScoringService.reverseTransaction(
          originalTransaction.id,
          { reason: `Atividade #${id.slice(0, 8)} editada pelo próprio usuário (valor anterior: ${this.quantityLabel(activity.unit, activity.quantity)})` },
          userId,
          tx,
        );
      }

      await tx.userActivity.update({
        where: { id },
        data: {
          quantity: newQuantity,
          activityDate: newActivityDate,
          description: newDescription,
          calculatedPoints: newCalculatedPoints,
        },
      });

      // Mesmo motor de sempre — já dispara conquistas/desafio/nível
      // automaticamente (ScoringService.creditPoints).
      await ScoringService.creditPoints(
        {
          userId,
          points: newCalculatedPoints,
          transactionType: 'ACTIVITY',
          description: `Pontuação referente a ${activity.activityType.name} (${this.quantityLabel(activity.unit, newQuantity)}) - Atividade #${id.slice(0, 8)} (editada)`,
          createdBy: userId,
          activityId: id,
          referenceType: 'UserActivity',
          referenceId: id,
          cycleReferenceDate: newActivityDate,
        },
        tx,
      );

      // O card do post no Mural já lê quantidade/pontos AO VIVO da
      // atividade vinculada — só o textinho fixo gerado na aprovação
      // precisa ser regravado pra continuar batendo com os números novos.
      await tx.post.updateMany({
        where: { activityId: id },
        data: {
          content: `Registrou uma atividade de ${activity.activityType.name} (${this.quantityLabel(activity.unit, newQuantity)}) e ganhou ${newCalculatedPoints} pontos! 🎉`,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'EDIT_ACTIVITY',
          entity: 'UserActivity',
          entityId: id,
          oldValues: JSON.stringify(oldValuesLog),
          newValues: JSON.stringify(newValuesLog),
        },
      });
    }, { timeout: 15000 });

    return prisma.userActivity.findUniqueOrThrow({ where: { id }, include: ACTIVITY_WITH_TYPE_INCLUDE });
  }

  /**
   * Exclui (ou cancela) uma atividade — a pedido do usuário.
   *
   * - `PENDING`/`REJECTED`: exclusão de verdade (nada foi creditado ainda) —
   *   remove também os arquivos de evidência do storage (Cloudinary/local),
   *   senão ficariam órfãos.
   * - `APPROVED`: vira `CANCELLED` (nunca apaga o registro — já gerou
   *   histórico de pontos, Regra de Ouro do ledger). Reverte o crédito e o
   *   progresso de desafio que ela alimentou, e oculta o post automático do
   *   Mural. Só permitido se o ciclo em que ela pontuou ainda estiver
   *   `ACTIVE` (`assertCycleStillEditable`). Conquistas desbloqueadas por
   *   ela permanecem — vitalícias, nunca revogadas.
   * - `CANCELLED`: já está cancelada, nada a fazer.
   */
  public static async remove(id: string, userId: string) {
    const activity = await prisma.userActivity.findUnique({
      where: { id },
      include: { evidences: true, activityType: { select: { name: true } } },
    });
    if (!activity) throw new NotFoundError(`Atividade com ID '${id}' não foi encontrada.`);
    if (activity.userId !== userId) {
      throw new ForbiddenError('Você só pode excluir as próprias atividades.');
    }

    if (activity.status === 'CANCELLED') {
      throw new AppError('Esta atividade já está cancelada.', 422, 'ACTIVITY_ALREADY_CANCELLED');
    }

    if (activity.status === 'PENDING' || activity.status === 'REJECTED') {
      const storage = getStorageProvider();
      for (const evidence of activity.evidences) {
        // best-effort: se o arquivo já não existir no storage por algum
        // motivo, não trava a exclusão do registro por causa disso.
        await storage.delete(evidence.storagePath).catch(() => undefined);
      }

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'DELETE_ACTIVITY',
            entity: 'UserActivity',
            entityId: id,
            oldValues: JSON.stringify({
              status: activity.status,
              activityTypeName: activity.activityType.name,
              quantity: activity.quantity,
              activityDate: activity.activityDate,
            }),
          },
        });
        await tx.userActivity.delete({ where: { id } });
      });

      return { status: 'DELETED' as const };
    }

    // APPROVED → CANCELLED
    const originalTransactionPreview = await this.findLatestUnreversedTransaction(prisma, {
      activityId: id,
      transactionType: 'ACTIVITY',
    });
    await this.assertCycleStillEditable(originalTransactionPreview?.cycleId ?? null);

    await prisma.$transaction(async (tx) => {
      const toReverseReward = await ChallengeService.undoProgressForActivity(
        userId,
        {
          activityTypeId: activity.activityTypeId,
          activityDate: activity.activityDate,
          quantity: activity.quantity,
          validatedAt: activity.validatedAt,
        },
        tx,
      );
      await this.reverseChallengeRewardsIfAny(userId, toReverseReward, id, 'excluída', tx);

      // Reconsulta DENTRO da transação pelo mesmo motivo do update().
      const originalTransaction = await this.findLatestUnreversedTransaction(tx, { activityId: id, transactionType: 'ACTIVITY' });
      if (originalTransaction) {
        await ScoringService.reverseTransaction(
          originalTransaction.id,
          { reason: `Atividade #${id.slice(0, 8)} excluída pelo próprio usuário` },
          userId,
          tx,
        );
      }

      await tx.userActivity.update({ where: { id }, data: { status: 'CANCELLED' } });

      // Oculta o post automático do Mural — não deixa circulando um post
      // dizendo "ganhou X pontos" de uma atividade que não existe mais
      // (a pedido do usuário).
      await tx.post.updateMany({ where: { activityId: id }, data: { status: 'HIDDEN' } });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CANCEL_ACTIVITY',
          entity: 'UserActivity',
          entityId: id,
          oldValues: JSON.stringify({ status: 'APPROVED' }),
          newValues: JSON.stringify({ status: 'CANCELLED' }),
        },
      });
    }, { timeout: 15000 });

    return { status: 'CANCELLED' as const };
  }
}
