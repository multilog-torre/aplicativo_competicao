import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { DepartmentService } from './department.service';
import { CreateDepartmentDTO, ListDepartmentsQueryDTO, UpdateDepartmentDTO } from './department.dto';

export class DepartmentController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListDepartmentsQueryDTO;
    const departments = await DepartmentService.list(query);
    return sendSuccess(res, departments, 200, { total: departments.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const department = await DepartmentService.getById(id);
    return sendSuccess(res, department, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateDepartmentDTO;
    const adminId = req.user!.id;
    const department = await DepartmentService.create(data, adminId);
    return sendSuccess(res, department, 201);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateDepartmentDTO;
    const adminId = req.user!.id;
    const department = await DepartmentService.update(id, data, adminId);
    return sendSuccess(res, department, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const adminId = req.user!.id;
    const result = await DepartmentService.delete(id, adminId);
    return sendSuccess(res, result, 200);
  }
}
