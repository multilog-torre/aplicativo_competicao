import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { uploadSingleFile } from '../../shared/middlewares/uploadMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { EvidenceController } from '../evidence/evidence.controller';
import { ActivityController } from './activity.controller';
import { CreateActivitySchema, ListActivitiesQuerySchema } from './activity.dto';

const router = Router();

/**
 * POST /api/v1/activities
 * Registra uma nova atividade. Qualquer usuário autenticado pode registrar.
 * Status inicial sempre PENDING — pontos ainda não são creditados (Fase 8).
 */
router.post(
  '/',
  ensureAuthenticated,
  validateRequest({ body: CreateActivitySchema }),
  asyncHandler(ActivityController.create),
);

/**
 * GET /api/v1/activities
 * Lista atividades. Participante vê apenas as próprias; Admin pode filtrar por userId.
 */
router.get(
  '/',
  ensureAuthenticated,
  validateRequest({ query: ListActivitiesQuerySchema }),
  asyncHandler(ActivityController.list),
);

/**
 * GET /api/v1/activities/:id
 * Detalhe de uma atividade específica.
 */
router.get('/:id', ensureAuthenticated, asyncHandler(ActivityController.getById));

/**
 * POST /api/v1/activities/:id/evidence
 * Envia um arquivo de evidência (multipart/form-data, campo "file").
 * Apenas o autor da atividade, enquanto ela estiver PENDING (Fase 7).
 */
router.post(
  '/:id/evidence',
  ensureAuthenticated,
  uploadSingleFile,
  asyncHandler(EvidenceController.upload),
);

/**
 * GET /api/v1/activities/:id/evidence
 * Lista os metadados das evidências de uma atividade.
 */
router.get('/:id/evidence', ensureAuthenticated, asyncHandler(EvidenceController.list));

/**
 * GET /api/v1/activities/:id/evidence/:evidenceId/download
 * Download autorizado do arquivo (nunca exposto por URL pública direta).
 */
router.get(
  '/:id/evidence/:evidenceId/download',
  ensureAuthenticated,
  asyncHandler(EvidenceController.download),
);

export { router as activityRoutes };
