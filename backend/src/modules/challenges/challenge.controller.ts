import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ChallengeService } from './challenge.service';
import { CreateChallengeDTO, ListChallengesQueryDTO, UpdateChallengeDTO } from './challenge.dto';

export class ChallengeController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListChallengesQueryDTO;
    const result = await ChallengeService.list(query);
    return sendSuccess(res, result.challenges, 200, result.pagination);
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const challenge = await ChallengeService.getById(id);
    return sendSuccess(res, challenge, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateChallengeDTO;
    const adminId = req.user!.id;
    const challenge = await ChallengeService.create(data, adminId);
    return sendSuccess(res, challenge, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateChallengeDTO;
    const adminId = req.user!.id;
    const challenge = await ChallengeService.update(id, data, adminId);
    return sendSuccess(res, challenge, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await ChallengeService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** POST /challenges/:id/join */
  public static async join(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const participant = await ChallengeService.join(id, userId);
    return sendSuccess(res, participant, 201);
  }

  /** GET /challenges/:id/my-progress */
  public static async getMyProgress(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const progress = await ChallengeService.getMyProgress(id, userId);
    return sendSuccess(res, progress, 200);
  }

  /** GET /challenges/:id/participants */
  public static async listParticipants(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const participants = await ChallengeService.listParticipants(id);
    return sendSuccess(res, participants, 200, { total: participants.length });
  }

  /** GET /challenges/:id/departments */
  public static async listDepartmentProgress(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const departments = await ChallengeService.listDepartmentProgress(id);
    return sendSuccess(res, departments, 200, { total: departments.length });
  }
}
