import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { sendSuccess } from '../../shared/utils/apiResponse';

const router = Router();

/**
 * GET /api/v1/roles
 * Catálogo de papéis disponíveis (PARTICIPANTE/ADMIN/ADMIN_MASTER) — leitura
 * pública, mesmo padrão de /departments; usado pelo seletor de papéis na
 * tela de gestão de usuários.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    return sendSuccess(res, roles, 200, { total: roles.length });
  }),
);

export { router as roleRoutes };
