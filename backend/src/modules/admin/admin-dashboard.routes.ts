import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AdminDashboardController } from './admin-dashboard.controller';

const router = Router();

/**
 * GET /api/v1/admin/dashboard
 * Indicadores e gráficos agregados de todo o sistema — restrito a ADMIN/ADMIN_MASTER.
 */
router.get('/', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(AdminDashboardController.get));

export { router as adminDashboardRoutes };
