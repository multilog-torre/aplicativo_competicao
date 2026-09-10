import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { CycleService } from './cycle.service';
import { CreateCycleDTO, CyclePrizeDTO, ListCyclesQueryDTO, UpdateCycleDTO } from './cycle.dto';

export class CycleController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListCyclesQueryDTO;
    const result = await CycleService.list(query);
    return sendSuccess(res, result.cycles, 200, result.pagination);
  }

  public static async getCurrent(_req: Request, res: Response): Promise<Response> {
    const current = await CycleService.getCurrent();
    return sendSuccess(res, current, 200);
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const cycle = await CycleService.getById(id);
    return sendSuccess(res, cycle, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateCycleDTO;
    const adminId = req.user!.id;
    const cycle = await CycleService.create(data, adminId);
    return sendSuccess(res, cycle, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateCycleDTO;
    const adminId = req.user!.id;
    const cycle = await CycleService.update(id, data, adminId);
    return sendSuccess(res, cycle, 200);
  }

  public static async upsertPrize(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as CyclePrizeDTO;
    const adminId = req.user!.id;
    const prize = await CycleService.upsertPrize(id, data, adminId);
    return sendSuccess(res, prize, 200);
  }

  public static async cancel(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const cycle = await CycleService.cancel(id, adminId);
    return sendSuccess(res, cycle, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await CycleService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
