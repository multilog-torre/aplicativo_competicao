import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { CreateActivityTypeDTO, ListActivityTypesQueryDTO, UpdateActivityTypeDTO } from './activity-type.dto';

export class ActivityTypeService {
  public static async list(query: ListActivityTypesQueryDTO) {
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    const modalities = await prisma.activityType.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            activities: true,
            challenges: true,
          },
        },
      },
    });

    return modalities.map((mod) => ({
      id: mod.id,
      name: mod.name,
      description: mod.description,
      category: mod.category,
      icon: mod.icon,
      rulesDescription: mod.rulesDescription,
      scoringType: mod.scoringType,
      basePoints: mod.basePoints,
      unit: mod.unit,
      multiplier: mod.multiplier,
      dailyLimit: mod.dailyLimit,
      weeklyLimit: mod.weeklyLimit,
      monthlyLimit: mod.monthlyLimit,
      requiresEvidence: mod.requiresEvidence,
      allowedFileTypes: mod.allowedFileTypes,
      status: mod.status,
      activitiesCount: mod._count.activities,
      challengesCount: mod._count.challenges,
      createdAt: mod.createdAt,
      updatedAt: mod.updatedAt,
    }));
  }

  public static async getById(id: string) {
    const modality = await prisma.activityType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            activities: true,
            challenges: true,
          },
        },
      },
    });

    if (!modality) {
      throw new NotFoundError(`Modalidade com ID '${id}' não foi encontrada.`);
    }

    return {
      id: modality.id,
      name: modality.name,
      description: modality.description,
      category: modality.category,
      icon: modality.icon,
      rulesDescription: modality.rulesDescription,
      scoringType: modality.scoringType,
      basePoints: modality.basePoints,
      unit: modality.unit,
      multiplier: modality.multiplier,
      dailyLimit: modality.dailyLimit,
      weeklyLimit: modality.weeklyLimit,
      monthlyLimit: modality.monthlyLimit,
      requiresEvidence: modality.requiresEvidence,
      allowedFileTypes: modality.allowedFileTypes,
      status: modality.status,
      activitiesCount: modality._count.activities,
      challengesCount: modality._count.challenges,
      createdAt: modality.createdAt,
      updatedAt: modality.updatedAt,
    };
  }

  public static async create(data: CreateActivityTypeDTO, adminId: string) {
    const existing = await prisma.activityType.findFirst({
      where: { name: { equals: data.name } },
    });

    if (existing) {
      throw new AppError(`Já existe uma modalidade cadastrada com o nome '${data.name}'.`, 409, 'CONFLICT');
    }

    const newModality = await prisma.activityType.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        icon: data.icon,
        rulesDescription: data.rulesDescription,
        scoringType: data.scoringType,
        basePoints: data.basePoints,
        unit: data.unit,
        multiplier: data.multiplier,
        dailyLimit: data.dailyLimit,
        weeklyLimit: data.weeklyLimit,
        monthlyLimit: data.monthlyLimit,
        requiresEvidence: data.requiresEvidence,
        allowedFileTypes: data.allowedFileTypes,
        status: data.status,
      },
    });

    // Registra na trilha de auditoria
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CREATE',
        entity: 'ActivityType',
        entityId: newModality.id,
        newValues: JSON.stringify(newModality),
      },
    });

    return newModality;
  }

  public static async update(id: string, data: UpdateActivityTypeDTO, adminId: string) {
    const existing = await prisma.activityType.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundError(`Modalidade com ID '${id}' não foi encontrada.`);
    }

    if (data.name && data.name !== existing.name) {
      const nameConflict = await prisma.activityType.findFirst({
        where: { name: { equals: data.name }, id: { not: id } },
      });
      if (nameConflict) {
        throw new AppError(`Já existe outra modalidade com o nome '${data.name}'.`, 409, 'CONFLICT');
      }
    }

    const updated = await prisma.activityType.update({
      where: { id },
      data,
    });

    // Registra na trilha de auditoria
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'ActivityType',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return updated;
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.activityType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            activities: true,
            challenges: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Modalidade com ID '${id}' não foi encontrada.`);
    }

    const hasRelations = existing._count.activities > 0 || existing._count.challenges > 0;

    let resultStatus = 'INACTIVE';
    if (hasRelations) {
      // Soft Delete para manter integridade das atividades existentes
      await prisma.activityType.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      resultStatus = 'DEACTIVATED';
    } else {
      // Exclusão definitiva se não tiver histórico
      await prisma.activityType.delete({ where: { id } });
      resultStatus = 'DELETED';
    }

    // Registra auditoria
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: resultStatus === 'DELETED' ? 'DELETE' : 'DEACTIVATE',
        entity: 'ActivityType',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({ status: resultStatus }),
      },
    });

    return {
      message:
        resultStatus === 'DELETED'
          ? 'Modalidade excluída com sucesso.'
          : 'Modalidade desativada com sucesso para preservar o histórico de atividades.',
      status: resultStatus,
    };
  }
}
