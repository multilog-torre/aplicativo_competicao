import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { ScoringService } from '../scoring/scoring.service';
import { CreateActivityDTO, ListActivitiesQueryDTO } from './activity.dto';

export class ActivityService {
  /**
   * Registra uma nova atividade para validação administrativa posterior.
   *
   * REGRA DA FASE 6: a atividade nasce sempre com status PENDING.
   * O cálculo de pontos é feito aqui (calculatedPoints) apenas como PREVISÃO —
   * nenhum points_transaction é criado e o total do usuário NÃO é alterado.
   * O crédito oficial de pontos só ocorre na aprovação administrativa (Fase 8).
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
      include: {
        activityType: {
          select: { id: true, name: true, icon: true, unit: true, requiresEvidence: true, allowedFileTypes: true },
        },
      },
    });

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
        },
      }),
    ]);

    return {
      activities,
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
}
