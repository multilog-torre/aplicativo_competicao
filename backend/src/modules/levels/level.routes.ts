import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { LevelController } from './level.controller';
import { CreateLevelSchema, UpdateLevelSchema } from './level.dto';

const router = Router();

// 1. Leitura — pública para qualquer usuário (mesmo padrão de /activity-types),
// já que a escada de níveis é informação de progressão visível a todos.
router.get('/', asyncHandler(LevelController.list));
router.get('/:id', asyncHandler(LevelController.getById));

// 2. Escrita — restrita a ADMIN/ADMIN_MASTER (configurável sem alterar código)
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateLevelSchema }),
  asyncHandler(LevelController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateLevelSchema }),
  asyncHandler(LevelController.update),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(LevelController.delete),
);

export { router as levelRoutes };
