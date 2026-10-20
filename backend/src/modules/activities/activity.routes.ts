import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { uploadSingleFile } from '../../shared/middlewares/uploadMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { EvidenceController } from '../evidence/evidence.controller';
import { ActivityController } from './activity.controller';
import { CreateActivitySchema, ListActivitiesQuerySchema, UpdateActivitySchema } from './activity.dto';

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
 * PATCH /api/v1/activities/:id
 * Edita a própria atividade (quantidade/data/descrição) — a pedido do
 * usuário. PENDING: livre. APPROVED: reverte e recredita com os valores
 * novos, só se o ciclo em que pontuou ainda estiver ativo. Ver
 * ActivityService.update.
 */
router.patch(
  '/:id',
  ensureAuthenticated,
  validateRequest({ body: UpdateActivitySchema }),
  asyncHandler(ActivityController.update),
);

/**
 * DELETE /api/v1/activities/:id
 * Exclui (PENDING/REJECTED) ou cancela (APPROVED) a própria atividade — a
 * pedido do usuário. Ver ActivityService.remove.
 */
router.delete('/:id', ensureAuthenticated, asyncHandler(ActivityController.remove));

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
