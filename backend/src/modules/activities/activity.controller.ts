import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ActivityService } from './activity.service';
import { CreateActivityDTO, ListActivitiesQueryDTO } from './activity.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class ActivityController {
  /** POST /activities — Registra uma nova atividade (status inicial: PENDING) */
  static async create(req: Request, res: Response) {
    const dto = req.body as CreateActivityDTO;
    const userId = req.user!.id;

    const activity = await ActivityService.create(dto, userId);
    return sendSuccess(res, activity, 201);
  }

  /** GET /activities — Lista atividades (participante vê só as próprias) */
  static async list(req: Request, res: Response) {
    const query = req.query as unknown as ListActivitiesQueryDTO;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);

    const result = await ActivityService.list(query, userId, isAdmin);
    return sendSuccess(res, result.activities, 200, result.pagination);
  }

  /** GET /activities/:id — Detalhe de uma atividade */
  static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);

    const activity = await ActivityService.getById(id, userId, isAdmin);
    return sendSuccess(res, activity, 200);
  }
}
