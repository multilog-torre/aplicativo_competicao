import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { DepartmentController } from './department.controller';
import { ListDepartmentsQuerySchema } from './department.dto';

const router = Router();

// Leitura pública — mesmo padrão de /activity-types, /levels, etc.
router.get('/', validateRequest({ query: ListDepartmentsQuerySchema }), asyncHandler(DepartmentController.list));
router.get('/:id', asyncHandler(DepartmentController.getById));

export { router as departmentRoutes };
