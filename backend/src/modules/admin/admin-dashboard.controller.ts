import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AdminDashboardService } from './admin-dashboard.service';

export class AdminDashboardController {
  public static async get(_req: Request, res: Response): Promise<Response> {
    const dashboard = await AdminDashboardService.get();
    return sendSuccess(res, dashboard, 200);
  }
}
