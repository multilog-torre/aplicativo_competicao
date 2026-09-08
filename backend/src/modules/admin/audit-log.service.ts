import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { tryParseJson } from '../../shared/utils/json';
import { ListAuditLogsQueryDTO } from './audit-log.dto';

export class AuditLogService {
  /**
   * Lista a trilha de auditoria com filtros e paginação.
   * Toda operação crítica do sistema (aprovações, rejeições, ajustes de pontos,
   * alterações de modalidade, uploads de evidência, login/logout) já é registrada
   * em audit_logs pelos respectivos módulos desde as Fases 3, 4, 5, 7 e 8.
   */
  public static async list(query: ListAuditLogsQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return {
      logs: logs.map((log) => ({
        ...log,
        oldValues: tryParseJson(log.oldValues),
        newValues: tryParseJson(log.newValues),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Detalhe de um registro específico de auditoria. */
  public static async getById(id: string) {
    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!log) {
      throw new NotFoundError(`Registro de auditoria com ID '${id}' não foi encontrado.`);
    }

    return {
      ...log,
      oldValues: tryParseJson(log.oldValues),
      newValues: tryParseJson(log.newValues),
    };
  }
}
