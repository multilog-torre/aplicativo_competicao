import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { DepartmentService } from './department.service';
import { ListDepartmentsQueryDTO } from './department.dto';

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
}
