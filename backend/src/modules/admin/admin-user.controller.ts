import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AdminUserService } from './admin-user.service';
import { CreateUserDTO, ListUsersQueryDTO, SetUserRolesDTO, UpdateUserDTO } from './admin-user.dto';

export class AdminUserController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListUsersQueryDTO;
    const result = await AdminUserService.list(query);
    return sendSuccess(res, result.users, 200, result.pagination);
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const user = await AdminUserService.getById(id);
    return sendSuccess(res, user, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateUserDTO;
    const adminId = req.user!.id;
    const user = await AdminUserService.create(data, adminId);
    return sendSuccess(res, user, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateUserDTO;
    const adminId = req.user!.id;
    const user = await AdminUserService.update(id, data, adminId);
    return sendSuccess(res, user, 200);
  }

  public static async setRoles(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as SetUserRolesDTO;
    const adminId = req.user!.id;
    const user = await AdminUserService.setRoles(id, data, adminId);
    return sendSuccess(res, user, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await AdminUserService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
