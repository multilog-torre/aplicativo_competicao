import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AdminDashboardController } from './admin-dashboard.controller';

const router = Router();

/**
 * GET /api/v1/admin/dashboard
 * Indicadores e gráficos agregados de todo o sistema — visão consolidada do
 * progresso de todos os colaboradores (ranking geral, histórico de pontos e
 * atividades). Aberta a qualquer usuário autenticado: são apenas agregados
 * (sem dados individuais sensíveis), e faz parte do incentivo social da
 * plataforma que qualquer participante acompanhe o avanço coletivo.
 */
router.get('/', ensureAuthenticated, asyncHandler(AdminDashboardController.get));

export { router as adminDashboardRoutes };
