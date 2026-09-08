import { Router } from 'express';
import { attachUserIfPresent, ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { GameRuleController } from './game-rule.controller';
import { CreateGameRuleStepSchema, UpdateGameRuleStepSchema } from './game-rule.dto';

const router = Router();

// 1. Leitura — pública (a página "Como funciona?" não deve exigir login),
// mesmo padrão de /levels e /achievements. attachUserIfPresent identifica um
// admin autenticado (para incluir passos INACTIVE) sem exigir login de ninguém.
router.get('/', attachUserIfPresent, asyncHandler(GameRuleController.list));
router.get('/:id', asyncHandler(GameRuleController.getById));

// 2. Escrita — restrita a ADMIN/ADMIN_MASTER
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateGameRuleStepSchema }),
  asyncHandler(GameRuleController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateGameRuleStepSchema }),
  asyncHandler(GameRuleController.update),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(GameRuleController.delete),
);

export { router as gameRuleRoutes };
