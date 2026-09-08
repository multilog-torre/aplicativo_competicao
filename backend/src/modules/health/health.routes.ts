import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { HealthController } from './health.controller';

const router = Router();

router.get('/health', asyncHandler(HealthController.getHealth));
router.get('/info', asyncHandler(HealthController.getInfo));

export { router as healthRoutes };
