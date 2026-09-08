import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { RewardController } from './reward.controller';
import {
  CancelRedemptionSchema,
  CreateRewardSchema,
  ListRedemptionsQuerySchema,
  ListRewardsQuerySchema,
  UpdateRewardSchema,
} from './reward.dto';

const router = Router();

// 1. Catálogo — leitura pública (mesmo padrão de /levels, /achievements, /challenges)
router.get('/', validateRequest({ query: ListRewardsQuerySchema }), asyncHandler(RewardController.list));

// 2. Resgates — rotas de coleção '/redemptions' PRECISAM vir antes de '/:id' genérico
router.get(
  '/redemptions',
  ensureAuthenticated,
  validateRequest({ query: ListRedemptionsQuerySchema }),
  asyncHandler(RewardController.listRedemptions),
);
router.get('/redemptions/:id', ensureAuthenticated, asyncHandler(RewardController.getRedemptionById));

router.post(
  '/redemptions/:id/approve',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(RewardController.approveRedemption),
);
router.post(
  '/redemptions/:id/deliver',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(RewardController.deliverRedemption),
);
router.post(
  '/redemptions/:id/cancel',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CancelRedemptionSchema }),
  asyncHandler(RewardController.cancelRedemption),
);

// 3. Detalhe do catálogo e resgate
router.get('/:id', asyncHandler(RewardController.getById));
router.post('/:id/redeem', ensureAuthenticated, asyncHandler(RewardController.redeem));

// 4. Escrita do catálogo — restrita a ADMIN/ADMIN_MASTER
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateRewardSchema }),
  asyncHandler(RewardController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateRewardSchema }),
  asyncHandler(RewardController.update),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(RewardController.delete),
);

export { router as rewardRoutes };
