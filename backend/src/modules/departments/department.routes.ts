import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { DepartmentController } from './department.controller';
import { CreateDepartmentSchema, ListDepartmentsQuerySchema, UpdateDepartmentSchema } from './department.dto';

const router = Router();

// Leitura pública — mesmo padrão de /activity-types, /levels, etc.
router.get('/', validateRequest({ query: ListDepartmentsQuerySchema }), asyncHandler(DepartmentController.list));
router.get('/:id', asyncHandler(DepartmentController.getById));

// Escrita restrita a ADMIN e ADMIN_MASTER
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateDepartmentSchema }),
  asyncHandler(DepartmentController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateDepartmentSchema }),
  asyncHandler(DepartmentController.update),
);

router.delete('/:id', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(DepartmentController.delete));

export { router as departmentRoutes };
