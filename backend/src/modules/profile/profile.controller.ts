import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ProfileService } from './profile.service';
import { SetAvatarDTO, UpdateProfileDTO } from './profile.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class ProfileController {
  public static async getOwn(req: Request, res: Response): Promise<Response> {
    const userId = req.user!.id;
    const profile = await ProfileService.getOwnProfile(userId);
    return sendSuccess(res, profile, 200);
  }

  public static async getByUserId(req: Request, res: Response): Promise<Response> {
    const { userId } = req.params;
    const requestingUserId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const profile = await ProfileService.getPublicProfile(userId, requestingUserId, isAdmin);
    return sendSuccess(res, profile, 200);
  }

  public static async updateOwn(req: Request, res: Response): Promise<Response> {
    const userId = req.user!.id;
    const data = req.body as UpdateProfileDTO;
    const result = await ProfileService.updateOwnProfile(userId, data);
    return sendSuccess(res, result, 200);
  }

  public static async listAvatarPresets(_req: Request, res: Response): Promise<Response> {
    const presets = ProfileService.listAvatarPresets();
    return sendSuccess(res, presets, 200, { total: presets.length });
  }

  public static async setAvatar(req: Request, res: Response): Promise<Response> {
    const { avatarType, presetId } = req.body as SetAvatarDTO;
    const userId = req.user!.id;
    const result = await ProfileService.setAvatar(userId, avatarType, presetId, req.file);
    return sendSuccess(res, result, 200);
  }

  public static async getAvatar(req: Request, res: Response): Promise<Response> {
    const { userId } = req.params;
    const { buffer } = await ProfileService.getAvatarForDownload(userId);
    res.setHeader('Content-Type', 'image/jpeg');
    return res.send(buffer);
  }
}
