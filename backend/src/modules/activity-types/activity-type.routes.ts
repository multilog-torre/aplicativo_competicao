import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ActivityTypeController } from './activity-type.controller';
import { createActivityTypeSchema, listActivityTypesQuerySchema, updateActivityTypeSchema } from './activity-type.dto';

const router = Router();

// 1. Rotas de Leitura (Disponíveis para todos os usuários autenticados)
router.get(
  '/',
  validateRequest({ query: listActivityTypesQuerySchema }),
  asyncHandler(ActivityTypeController.list)
);

router.get(
  '/:id',
  asyncHandler(ActivityTypeController.getById)
);

// 2. Rotas Administrativas (Restritas a ADMIN e ADMIN_MASTER)
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: createActivityTypeSchema }),
  asyncHandler(ActivityTypeController.create)
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: updateActivityTypeSchema }),
  asyncHandler(ActivityTypeController.update)
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(ActivityTypeController.delete)
);

export { router as activityTypeRoutes };
