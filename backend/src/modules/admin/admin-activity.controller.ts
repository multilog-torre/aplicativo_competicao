import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AdminActivityService } from './admin-activity.service';
import { ListPendingActivitiesQueryDTO, RejectActivityDTO } from './admin-activity.dto';

export class AdminActivityController {
  /** GET /admin/activities/pending — Fila de atividades aguardando avaliação */
  static async listPending(req: Request, res: Response) {
    const query = req.query as unknown as ListPendingActivitiesQueryDTO;
    const result = await AdminActivityService.listPending(query);
    return sendSuccess(res, result.activities, 200, result.pagination);
  }

  /** POST /admin/activities/:id/approve — Aprova e credita os pontos */
  static async approve(req: Request, res: Response) {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await AdminActivityService.approve(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** POST /admin/activities/:id/reject — Rejeita com motivo obrigatório */
  static async reject(req: Request, res: Response) {
    const { id } = req.params;
    const dto = req.body as RejectActivityDTO;
    const adminId = req.user!.id;
    const result = await AdminActivityService.reject(id, dto, adminId);
    return sendSuccess(res, result, 200);
  }
}
