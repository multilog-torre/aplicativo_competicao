import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { ScoringService } from '../scoring/scoring.service';
import { ListPendingActivitiesQueryDTO, RejectActivityDTO } from './admin-activity.dto';

export class AdminActivityService {
  /**
   * Lista a fila de atividades aguardando avaliação administrativa,
   * ordenada da mais antiga para a mais recente (fila FIFO de revisão).
   */
  public static async listPending(query: ListPendingActivitiesQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: 'PENDING' };
    if (query.userId) where.userId = query.userId;
    if (query.activityTypeId) where.activityTypeId = query.activityTypeId;

    const [total, activities] = await Promise.all([
      prisma.userActivity.count({ where }),
      prisma.userActivity.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, corporateId: true, department: { select: { name: true } } } },
          activityType: { select: { id: true, name: true, icon: true, unit: true, requiresEvidence: true } },
          _count: { select: { evidences: true } },
        },
      }),
    ]);

    return {
      activities,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Aprova uma atividade PENDING.
   *
   * Operação atômica (planejamento.md §32): valida atividade → altera status →
   * cria points_transaction → atualiza total do usuário → cria auditoria.
   * Tudo dentro de uma ÚNICA transação de banco (BEGIN...COMMIT/ROLLBACK).
   *
   * Verificação de nível, conquistas e desafios ocorrem dentro de
   * ScoringService.creditPoints (Fases 11, 12 e 13). A notificação de
   * aprovação (Fase 16) é criada aqui, na mesma transação atômica.
   */
  public static async approve(activityId: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const activity = await tx.userActivity.findUnique({
        where: { id: activityId },
        include: { activityType: true },
      });

      if (!activity) {
        throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
      }

      if (activity.status !== 'PENDING') {
        throw new AppError(
          `Esta atividade já foi avaliada anteriormente (status atual: ${activity.status}).`,
          422,
          'ACTIVITY_ALREADY_EVALUATED',
        );
      }

      // Integridade: se a modalidade exige comprovação, não permite aprovar sem evidência anexada
      if (activity.activityType.requiresEvidence) {
        const evidenceCount = await tx.activityEvidence.count({ where: { activityId } });
        if (evidenceCount === 0) {
          throw new AppError(
            'Esta modalidade exige comprovação e a atividade não possui nenhuma evidência anexada.',
            422,
            'EVIDENCE_REQUIRED',
          );
        }
      }

      const updatedActivity = await tx.userActivity.update({
        where: { id: activityId },
        data: {
          status: 'APPROVED',
          validatedAt: new Date(),
          validatedBy: adminId,
        },
      });

      const quantityLabel = activity.unit ? `${activity.quantity} ${activity.unit}` : `${activity.quantity}`;
      const creditResult = await ScoringService.creditPoints(
        {
          userId: activity.userId,
          points: activity.calculatedPoints,
          transactionType: 'ACTIVITY',
          description: `Pontuação referente a ${activity.activityType.name} (${quantityLabel}) - Atividade #${activity.id.slice(0, 8)}`,
          createdBy: adminId,
          activityId: activity.id,
          referenceType: 'UserActivity',
          referenceId: activity.id,
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'APPROVE_ACTIVITY',
          entity: 'UserActivity',
          entityId: activity.id,
          oldValues: JSON.stringify({ status: 'PENDING' }),
          newValues: JSON.stringify({
            status: 'APPROVED',
            pointsCredited: activity.calculatedPoints,
            transactionId: creditResult.transaction.id,
          }),
        },
      });

      await NotificationService.create(
        {
          userId: activity.userId,
          title: 'Atividade aprovada! ✅',
          message: `Sua atividade de ${activity.activityType.name} (${quantityLabel}) foi aprovada e você ganhou ${activity.calculatedPoints} pontos.`,
          type: 'ACTIVITY_APPROVED',
          referenceId: activity.id,
        },
        tx,
      );

      return {
        activity: updatedActivity,
        transaction: creditResult.transaction,
        newTotalPoints: creditResult.newTotalPoints,
      };
    });
  }

  /**
   * Rejeita uma atividade PENDING. Exige motivo. Nenhum ponto é creditado.
   */
  public static async reject(activityId: string, dto: RejectActivityDTO, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const activity = await tx.userActivity.findUnique({ where: { id: activityId } });

      if (!activity) {
        throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
      }

      if (activity.status !== 'PENDING') {
        throw new AppError(
          `Esta atividade já foi avaliada anteriormente (status atual: ${activity.status}).`,
          422,
          'ACTIVITY_ALREADY_EVALUATED',
        );
      }

      const updatedActivity = await tx.userActivity.update({
        where: { id: activityId },
        data: {
          status: 'REJECTED',
          validatedAt: new Date(),
          validatedBy: adminId,
          rejectionReason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'REJECT_ACTIVITY',
          entity: 'UserActivity',
          entityId: activity.id,
          oldValues: JSON.stringify({ status: 'PENDING' }),
          newValues: JSON.stringify({ status: 'REJECTED', reason: dto.reason }),
        },
      });

      await NotificationService.create(
        {
          userId: activity.userId,
          title: 'Atividade rejeitada',
          message: `Sua atividade não foi aprovada. Motivo: ${dto.reason}`,
          type: 'ACTIVITY_REJECTED',
          referenceId: activity.id,
        },
        tx,
      );

      return updatedActivity;
    });
  }
}
