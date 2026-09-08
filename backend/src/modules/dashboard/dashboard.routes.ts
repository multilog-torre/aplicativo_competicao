import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { DashboardController } from './dashboard.controller';
import { GetDashboardQuerySchema } from './dashboard.dto';

const router = Router();

/**
 * GET /api/v1/dashboard
 * Dashboard pessoal do participante autenticado — sempre o próprio, nunca de
 * outro usuário (não há parâmetro de userId, nem para admin).
 */
router.get('/', ensureAuthenticated, validateRequest({ query: GetDashboardQuerySchema }), asyncHandler(DashboardController.get));

export { router as dashboardRoutes };
