import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AdminDashboardController } from './admin-dashboard.controller';
import { DashboardFiltersSchema } from './admin-dashboard.dto';

const router = Router();

/**
 * GET /api/v1/admin/dashboard
 * Indicadores e gráficos agregados de todo o sistema — visão consolidada do
 * progresso de todos os colaboradores (ranking geral, histórico de pontos e
 * atividades). Aberta a qualquer usuário autenticado: são apenas agregados
 * (sem dados individuais sensíveis), e faz parte do incentivo social da
 * plataforma que qualquer participante acompanhe o avanço coletivo.
 *
 * Aceita filtros opcionais via query string (dateFrom/dateTo/cycleId/
 * userId/departmentId/activityTypeId) que afetam apenas os gráficos —
 * ver admin-dashboard.dto.ts.
 */
router.get('/', ensureAuthenticated, validateRequest({ query: DashboardFiltersSchema }), asyncHandler(AdminDashboardController.get));

export { router as adminDashboardRoutes };
