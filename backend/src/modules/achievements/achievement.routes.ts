import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AchievementController } from './achievement.controller';
import { CreateAchievementSchema, UpdateAchievementSchema } from './achievement.dto';

const router = Router();

// 1. Leitura do catálogo — pública (transparência de gamificação, mesmo padrão de /levels)
router.get('/', asyncHandler(AchievementController.list));

// 2. Consulta de conquistas desbloqueadas por um usuário — autenticado, self ou admin
// (precisa vir ANTES de '/:id' para não ser interpretada como um ID de conquista)
router.get(
  '/users/:userId',
  ensureAuthenticated,
  asyncHandler(AchievementController.listUnlockedForUser),
);

router.get('/:id', asyncHandler(AchievementController.getById));

// 3. Escrita — restrita a ADMIN/ADMIN_MASTER
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateAchievementSchema }),
  asyncHandler(AchievementController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateAchievementSchema }),
  asyncHandler(AchievementController.update),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(AchievementController.delete),
);

export { router as achievementRoutes };
