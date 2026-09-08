import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { CreateActivityTypeDTO, ListActivityTypesQueryDTO, UpdateActivityTypeDTO } from './activity-type.dto';
import { ActivityTypeService } from './activity-type.service';

export class ActivityTypeController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListActivityTypesQueryDTO;
    const modalities = await ActivityTypeService.list(query);
    return sendSuccess(res, modalities, 200, { total: modalities.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const modality = await ActivityTypeService.getById(id);
    return sendSuccess(res, modality, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateActivityTypeDTO;
    const adminId = req.user!.id;
    const modality = await ActivityTypeService.create(data, adminId);
    return sendSuccess(res, modality, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateActivityTypeDTO;
    const adminId = req.user!.id;
    const modality = await ActivityTypeService.update(id, data, adminId);
    return sendSuccess(res, modality, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await ActivityTypeService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
