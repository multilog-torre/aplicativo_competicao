import { Router } from 'express';
import { attachUserIfPresent, ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { EventController } from './event.controller';
import {
  ApproveEventSchema,
  ConfirmAttendanceSchema,
  CreateEventSchema,
  ListEventsQuerySchema,
  RejectEventSchema,
} from './event.dto';

const router = Router();

// 1. Leitura — pública, mas enriquecida quando há usuário logado (mostra os
// próprios eventos PENDING/REJEITADOS, e se já está inscrito em cada um).
router.get('/', attachUserIfPresent, validateRequest({ query: ListEventsQuerySchema }), asyncHandler(EventController.list));
router.get('/:id', attachUserIfPresent, asyncHandler(EventController.getById));

// 2. Criação — QUALQUER usuário autenticado pode propor um evento.
router.post('/', ensureAuthenticated, validateRequest({ body: CreateEventSchema }), asyncHandler(EventController.create));
router.delete('/:id', ensureAuthenticated, asyncHandler(EventController.delete));

// 3. Participação — autenticado (precisa vir antes de rotas admin genéricas).
router.post('/:id/join', ensureAuthenticated, asyncHandler(EventController.join));
router.post('/:id/leave', ensureAuthenticated, asyncHandler(EventController.leave));

// 4. Moderação e confirmação de presença — restrito a ADMIN/ADMIN_MASTER.
router.get('/:id/participants', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(EventController.listParticipants));
router.post(
  '/:id/approve',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: ApproveEventSchema }),
  asyncHandler(EventController.approve),
);
router.post(
  '/:id/reject',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: RejectEventSchema }),
  asyncHandler(EventController.reject),
);
router.post('/:id/cancel', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(EventController.cancel));
router.post(
  '/:id/confirm-attendance',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: ConfirmAttendanceSchema }),
  asyncHandler(EventController.confirmAttendance),
);

export { router as eventRoutes };
