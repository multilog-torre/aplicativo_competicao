import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDTO } from './notification.dto';

export class NotificationController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListNotificationsQueryDTO;
    const userId = req.user!.id;
    const result = await NotificationService.list(userId, query);
    return sendSuccess(res, result.notifications, 200, result.pagination);
  }

  public static async getUnreadCount(req: Request, res: Response): Promise<Response> {
    const userId = req.user!.id;
    const count = await NotificationService.getUnreadCount(userId);
    return sendSuccess(res, { count }, 200);
  }

  public static async markAsRead(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const notification = await NotificationService.markAsRead(id, userId);
    return sendSuccess(res, notification, 200);
  }

  public static async markAllAsRead(req: Request, res: Response): Promise<Response> {
    const userId = req.user!.id;
    const result = await NotificationService.markAllAsRead(userId);
    return sendSuccess(res, result, 200);
  }
}
