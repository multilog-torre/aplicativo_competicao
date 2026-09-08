import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { AuthController } from './auth.controller';
import { loginSchema, refreshTokenSchema } from './auth.dto';

const router = Router();

// Rotas Públicas
router.post('/login', validateRequest({ body: loginSchema }), asyncHandler(AuthController.login));
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), asyncHandler(AuthController.refreshToken));

// Rotas Protegidas por Autenticação JWT
router.post('/logout', ensureAuthenticated, asyncHandler(AuthController.logout));
router.get('/me', ensureAuthenticated, asyncHandler(AuthController.getMe));

// Rotas de Teste de Permissões e Perfis (RBAC)
router.get(
  '/test/participant',
  ensureAuthenticated,
  requireRoles(['PARTICIPANTE']),
  asyncHandler(AuthController.testParticipant)
);

router.get(
  '/test/admin',
  ensureAuthenticated,
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  asyncHandler(AuthController.testAdmin)
);

router.get(
  '/test/master',
  ensureAuthenticated,
  requireRoles(['ADMIN_MASTER']),
  asyncHandler(AuthController.testMaster)
);

export { router as authRoutes };
