import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { RankingController } from './ranking.controller';
import { ListRankingQuerySchema } from './ranking.dto';

const router = Router();

/**
 * GET /api/v1/ranking
 * Qualquer usuário autenticado pode consultar o ranking (participante ou admin).
 */
router.get('/', ensureAuthenticated, validateRequest({ query: ListRankingQuerySchema }), asyncHandler(RankingController.list));

export { router as rankingRoutes };
