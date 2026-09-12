import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ParticipantService } from './participant.service';
import { ListParticipantsQueryDTO } from './participant.dto';

export class ParticipantController {
  /** GET /participants — Lista de todos os participantes (busca + filtro por departamento) */
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListParticipantsQueryDTO;
    const result = await ParticipantService.list(query);
    return sendSuccess(res, result.entries, 200, result.pagination);
  }
}
