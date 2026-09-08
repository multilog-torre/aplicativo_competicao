import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { AdminActivityController } from './admin-activity.controller';
import { ListPendingActivitiesQuerySchema, RejectActivitySchema } from './admin-activity.dto';

const router = Router();

// Todas as rotas administrativas exigem ADMIN ou ADMIN_MASTER
router.use(ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']));

/**
 * GET /api/v1/admin/activities/pending
 * Lista a fila de atividades aguardando validação.
 */
router.get(
  '/pending',
  validateRequest({ query: ListPendingActivitiesQuerySchema }),
  asyncHandler(AdminActivityController.listPending),
);

/**
 * POST /api/v1/admin/activities/:id/approve
 * Aprova a atividade: PENDING -> APPROVED -> points_transaction -> total atualizado.
 */
router.post('/:id/approve', asyncHandler(AdminActivityController.approve));

/**
 * POST /api/v1/admin/activities/:id/reject
 * Rejeita a atividade: PENDING -> REJECTED. Exige motivo.
 */
router.post(
  '/:id/reject',
  validateRequest({ body: RejectActivitySchema }),
  asyncHandler(AdminActivityController.reject),
);

export { router as adminActivityRoutes };
