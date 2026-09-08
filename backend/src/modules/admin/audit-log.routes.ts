import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { AuditLogController } from './audit-log.controller';
import { ListAuditLogsQuerySchema } from './audit-log.dto';

const router = Router();

// A trilha de auditoria audita inclusive as ações dos ADMINs (aprovações, rejeições,
// alterações de modalidade). Por segregação de funções, apenas ADMIN_MASTER — o
// perfil de governança da plataforma (ver descrição do papel no seed) — pode
// consultá-la. Um ADMIN comum não audita as próprias ações.
router.use(ensureAuthenticated, requireRoles(['ADMIN_MASTER']));

/**
 * GET /api/v1/admin/audit-logs
 * Lista a trilha de auditoria com filtros (userId, action, entity, entityId, período).
 */
router.get('/', validateRequest({ query: ListAuditLogsQuerySchema }), asyncHandler(AuditLogController.list));

/**
 * GET /api/v1/admin/audit-logs/:id
 * Detalhe de um registro específico (valor anterior e novo já desserializados).
 */
router.get('/:id', asyncHandler(AuditLogController.getById));

export { router as auditLogRoutes };
