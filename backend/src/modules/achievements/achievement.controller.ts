import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AchievementService } from './achievement.service';
import { CreateAchievementDTO, SetAchievementIconDTO, UpdateAchievementDTO } from './achievement.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class AchievementController {
  public static async list(_req: Request, res: Response): Promise<Response> {
    const achievements = await AchievementService.list();
    return sendSuccess(res, achievements, 200, { total: achievements.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const achievement = await AchievementService.getById(id);
    return sendSuccess(res, achievement, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateAchievementDTO;
    const adminId = req.user!.id;
    const achievement = await AchievementService.create(data, adminId);
    return sendSuccess(res, achievement, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateAchievementDTO;
    const adminId = req.user!.id;
    const achievement = await AchievementService.update(id, data, adminId);
    return sendSuccess(res, achievement, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await AchievementService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }

  /** GET /achievements/users/:userId — Conquistas desbloqueadas por um usuário */
  public static async listUnlockedForUser(req: Request, res: Response): Promise<Response> {
    const { userId } = req.params;
    const requestingUserId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const unlocked = await AchievementService.listUnlockedForUser(userId, requestingUserId, isAdmin);
    return sendSuccess(res, unlocked, 200, { total: unlocked.length });
  }

  /** GET /achievements/users/:userId/progress — Catálogo completo + progresso do usuário */
  public static async getProgressForUser(req: Request, res: Response): Promise<Response> {
    const { userId } = req.params;
    const requestingUserId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const catalog = await AchievementService.getCatalogWithProgressForUser(userId, requestingUserId, isAdmin);
    return sendSuccess(res, catalog, 200, { total: catalog.length });
  }

  /** PATCH /achievements/:id/icon — troca o ícone (emoji ou upload de imagem) */
  public static async setIcon(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const { iconType, icon } = req.body as SetAchievementIconDTO;
    const adminId = req.user!.id;
    const achievement = await AchievementService.setIcon(id, iconType, icon, req.file, adminId);
    return sendSuccess(res, achievement, 200);
  }

  /** GET /achievements/:id/icon — imagem do ícone enviada (iconType='UPLOAD') */
  public static async getIcon(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const { buffer, mimeType } = await AchievementService.getIconForDownload(id);
    res.setHeader('Content-Type', mimeType);
    return res.send(buffer);
  }
}
