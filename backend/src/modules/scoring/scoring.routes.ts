import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { ScoringController } from './scoring.controller';
import {
  ListTransactionsQuerySchema,
  ManualTransactionSchema,
  ReversalSchema,
  SimulateScoreSchema,
} from './scoring.dto';

const router = Router();

/**
 * POST /api/v1/scoring/simulate
 * Simula a pontuação antes de submeter a atividade (qualquer usuário autenticado)
 */
router.post(
  '/simulate',
  ensureAuthenticated,
  validateRequest({ body: SimulateScoreSchema }),
  asyncHandler(ScoringController.simulate),
);

/**
 * GET /api/v1/scoring/transactions
 * Histórico de transações de pontos.
 * Admin: pode filtrar por qualquer usuário.
 * Participante: vê apenas o próprio histórico.
 */
router.get(
  '/transactions',
  ensureAuthenticated,
  validateRequest({ query: ListTransactionsQuerySchema }),
  asyncHandler(ScoringController.listTransactions),
);

/**
 * GET /api/v1/scoring/transactions/:id
 * Detalhe de uma transação, com a origem completamente resolvida (Fase 19).
 * Participante: só a própria. Admin: qualquer uma.
 */
router.get(
  '/transactions/:id',
  ensureAuthenticated,
  asyncHandler(ScoringController.getTransactionDetail),
);

/**
 * POST /api/v1/scoring/manual
 * Lançamento manual de pontos — restrito a ADMIN e ADMIN_MASTER
 */
router.post(
  '/manual',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: ManualTransactionSchema }),
  asyncHandler(ScoringController.manualTransaction),
);

/**
 * POST /api/v1/scoring/transactions/:id/reverse
 * Reversão de uma transação — restrito a ADMIN e ADMIN_MASTER
 */
router.post(
  '/transactions/:id/reverse',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: ReversalSchema }),
  asyncHandler(ScoringController.reverseTransaction),
);

export { router as scoringRoutes };
