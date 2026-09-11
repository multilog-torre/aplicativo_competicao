import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { DashboardService } from './dashboard.service';
import { GetDashboardQueryDTO } from './dashboard.dto';

export class DashboardController {
  public static async get(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as GetDashboardQueryDTO;
    const userId = req.user!.id;
    const dashboard = await DashboardService.getForUser(userId, query.activityLimit ?? 5, query);
    return sendSuccess(res, dashboard, 200);
  }
}
