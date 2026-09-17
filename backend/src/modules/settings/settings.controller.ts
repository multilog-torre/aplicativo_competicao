import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { SettingsService } from './settings.service';
import { UpdateSettingsDTO } from './settings.dto';

export class SettingsController {
  public static async get(_req: Request, res: Response): Promise<Response> {
    const settings = await SettingsService.get();
    return sendSuccess(res, settings, 200);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const data = req.body as UpdateSettingsDTO;
    const adminId = req.user!.id;
    const settings = await SettingsService.update(data, adminId);
    return sendSuccess(res, settings, 200);
  }
}
