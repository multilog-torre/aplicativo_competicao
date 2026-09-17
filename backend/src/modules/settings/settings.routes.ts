import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { SettingsController } from './settings.controller';
import { UpdateSettingsSchema } from './settings.dto';

const router = Router();

router.use(ensureAuthenticated);

// Leitura: qualquer ADMIN pode CONSULTAR o estado (útil pra entender por que
// a fila de Aprovações está vazia — a maioria já aprova sozinha).
router.get('/', requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(SettingsController.get));

// Escrita: alterar um comportamento sensível (aprovação automática contorna
// a Regra de Ouro "quem decide nunca é quem se beneficia") — restrito a
// ADMIN_MASTER, mesma régua da auditoria e da gestão de contas.
router.patch(
  '/',
  requireRoles(['ADMIN_MASTER']),
  validateRequest({ body: UpdateSettingsSchema }),
  asyncHandler(SettingsController.update),
);

export { router as settingsRoutes };
