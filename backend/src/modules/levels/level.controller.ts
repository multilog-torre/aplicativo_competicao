import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { LevelService } from './level.service';
import { CreateLevelDTO, UpdateLevelDTO } from './level.dto';

export class LevelController {
  public static async list(_req: Request, res: Response): Promise<Response> {
    const levels = await LevelService.list();
    return sendSuccess(res, levels, 200, { total: levels.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const level = await LevelService.getById(id);
    return sendSuccess(res, level, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateLevelDTO;
    const adminId = req.user!.id;
    const level = await LevelService.create(data, adminId);
    return sendSuccess(res, level, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateLevelDTO;
    const adminId = req.user!.id;
    const level = await LevelService.update(id, data, adminId);
    return sendSuccess(res, level, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await LevelService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
