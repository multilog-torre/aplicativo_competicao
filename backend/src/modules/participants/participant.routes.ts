import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ParticipantController } from './participant.controller';
import { ListParticipantsQuerySchema } from './participant.dto';

const router = Router();

/**
 * GET /api/v1/participants
 * Qualquer usuário autenticado pode ver a lista de participantes da
 * competição — a partir dela, clica em alguém e abre o perfil completo
 * (GET /profile/:userId).
 */
router.get('/', ensureAuthenticated, validateRequest({ query: ListParticipantsQuerySchema }), asyncHandler(ParticipantController.list));

export { router as participantRoutes };
