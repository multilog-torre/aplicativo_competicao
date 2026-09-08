import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ChallengeController } from './challenge.controller';
import { CreateChallengeSchema, ListChallengesQuerySchema, UpdateChallengeSchema } from './challenge.dto';

const router = Router();

// 1. Leitura — pública (transparência, mesmo padrão de /levels e /achievements)
router.get('/', validateRequest({ query: ListChallengesQuerySchema }), asyncHandler(ChallengeController.list));

// 2. Participação e progresso — autenticado (precisa vir antes de '/:id' genérico)
router.post('/:id/join', ensureAuthenticated, asyncHandler(ChallengeController.join));
router.get('/:id/my-progress', ensureAuthenticated, asyncHandler(ChallengeController.getMyProgress));
router.get('/:id/participants', asyncHandler(ChallengeController.listParticipants));
router.get('/:id/departments', asyncHandler(ChallengeController.listDepartmentProgress));

router.get('/:id', asyncHandler(ChallengeController.getById));

// 3. Escrita — restrita a ADMIN/ADMIN_MASTER
router.post(
  '/',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: CreateChallengeSchema }),
  asyncHandler(ChallengeController.create),
);

router.patch(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: UpdateChallengeSchema }),
  asyncHandler(ChallengeController.update),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(ChallengeController.delete),
);

export { router as challengeRoutes };
