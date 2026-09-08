import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { GameRuleService } from './game-rule.service';
import { CreateGameRuleStepDTO, UpdateGameRuleStepDTO } from './game-rule.dto';

function isAdminRequest(req: Request): boolean {
  return req.user?.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role)) ?? false;
}

export class GameRuleController {
  public static async list(req: Request, res: Response): Promise<Response> {
    // Só admin pode pedir para ver os passos INACTIVE; participante/anônimo vê só ACTIVE.
    const steps = await GameRuleService.list(isAdminRequest(req));
    return sendSuccess(res, steps, 200, { total: steps.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const step = await GameRuleService.getById(id);
    return sendSuccess(res, step, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateGameRuleStepDTO;
    const adminId = req.user!.id;
    const step = await GameRuleService.create(data, adminId);
    return sendSuccess(res, step, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateGameRuleStepDTO;
    const adminId = req.user!.id;
    const step = await GameRuleService.update(id, data, adminId);
    return sendSuccess(res, step, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await GameRuleService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
