import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { RewardService } from './reward.service';
import {
  CancelRedemptionDTO,
  CreateRewardDTO,
  ListRedemptionsQueryDTO,
  ListRewardsQueryDTO,
  UpdateRewardDTO,
} from './reward.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class RewardController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListRewardsQueryDTO;
    const result = await RewardService.list(query);
    return sendSuccess(res, result.rewards, 200, result.pagination);
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const reward = await RewardService.getById(id);
    return sendSuccess(res, reward, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateRewardDTO;
    const adminId = req.user!.id;
    const reward = await RewardService.create(data, adminId);
    return sendSuccess(res, reward, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateRewardDTO;
    const adminId = req.user!.id;
    const reward = await RewardService.update(id, data, adminId);
    return sendSuccess(res, reward, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await RewardService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** POST /rewards/:id/redeem */
  public static async redeem(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const result = await RewardService.redeem(id, userId);
    return sendSuccess(res, result, 201);
  }

  /** GET /rewards/redemptions */
  public static async listRedemptions(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListRedemptionsQueryDTO;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const result = await RewardService.listRedemptions(query, userId, isAdmin);
    return sendSuccess(res, result.redemptions, 200, result.pagination);
  }

  /** GET /rewards/redemptions/:id */
  public static async getRedemptionById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const redemption = await RewardService.getRedemptionById(id, userId, isAdmin);
    return sendSuccess(res, redemption, 200);
  }

  /** POST /rewards/redemptions/:id/approve */
  public static async approveRedemption(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await RewardService.approveRedemption(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** POST /rewards/redemptions/:id/deliver */
  public static async deliverRedemption(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await RewardService.deliverRedemption(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** POST /rewards/redemptions/:id/cancel */
  public static async cancelRedemption(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const dto = req.body as CancelRedemptionDTO;
    const adminId = req.user!.id;
    const result = await RewardService.cancelRedemption(id, dto, adminId);
    return sendSuccess(res, result, 200);
  }
}
