import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AdminUserController } from './admin-user.controller';
import { CreateUserSchema, ListUsersQuerySchema, SetUserRolesSchema, UpdateUserSchema } from './admin-user.dto';

const router = Router();

// Criar contas e conceder acesso administrativo é uma decisão de governança —
// restrito a ADMIN_MASTER, mesma régua da auditoria (Fase 9).
router.use(ensureAuthenticated, requireRoles(['ADMIN_MASTER']));

router.get('/', validateRequest({ query: ListUsersQuerySchema }), asyncHandler(AdminUserController.list));
router.get('/:id', asyncHandler(AdminUserController.getById));
router.post('/', validateRequest({ body: CreateUserSchema }), asyncHandler(AdminUserController.create));
router.patch('/:id', validateRequest({ body: UpdateUserSchema }), asyncHandler(AdminUserController.update));
router.patch('/:id/roles', validateRequest({ body: SetUserRolesSchema }), asyncHandler(AdminUserController.setRoles));

export { router as adminUserRoutes };
