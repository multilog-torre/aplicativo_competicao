import { prisma } from '../../config/database';
import { ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { TransactionClient } from '../../shared/types/prisma';
import { ListNotificationsQueryDTO } from './notification.dto';

export type NotificationType =
  | 'ACTIVITY_APPROVED'
  | 'ACTIVITY_REJECTED'
  | 'POINTS_ADJUSTED'
  | 'RANKING_UP'
  | 'LEVEL_UP'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'CHALLENGE_COMPLETED'
  | 'REWARD_UPDATE'
  | 'INFO';

export class NotificationService {
  /**
   * Cria uma notificação para o usuário. Aceita opcionalmente um `externalTx`
   * para participar da MESMA transação atômica do evento que a originou (ex.:
   * aprovação de atividade, desbloqueio de conquista) — mesmo padrão usado em
   * creditPoints/recalculateForUser desde as Fases 5/11.
   */
  public static async create(
    params: { userId: string; title: string; message: string; type: NotificationType; referenceId?: string },
    externalTx?: TransactionClient,
  ) {
    const client = externalTx ?? prisma;
    return client.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        referenceId: params.referenceId ?? null,
      },
    });
  }

  public static async list(userId: string, query: ListNotificationsQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (query.isRead !== undefined) where.isRead = query.isRead;

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);

    return { notifications, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  public static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  public static async markAsRead(id: string, userId: string) {
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundError(`Notificação com ID '${id}' não foi encontrada.`);
    if (notification.userId !== userId) {
      throw new ForbiddenError('Você não tem permissão para marcar a notificação de outro usuário como lida.');
    }
    return prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  public static async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { updatedCount: result.count };
  }
}
