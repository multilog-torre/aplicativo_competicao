import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AdminDashboardService } from './admin-dashboard.service';
import { DashboardFiltersDTO } from './admin-dashboard.dto';

export class AdminDashboardController {
  public static async get(req: Request, res: Response): Promise<Response> {
    const filters = req.query as unknown as DashboardFiltersDTO;
    const dashboard = await AdminDashboardService.get(filters);
    return sendSuccess(res, dashboard, 200);
  }
}
