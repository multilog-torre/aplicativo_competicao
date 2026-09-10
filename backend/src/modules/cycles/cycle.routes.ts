import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { CycleController } from './cycle.controller';
import { CreateCycleSchema, CyclePrizeSchema, ListCyclesQuerySchema, UpdateCycleSchema } from './cycle.dto';

const router = Router();

// Leitura — pública (mesmo padrão de /levels, /achievements, /challenges):
// a competição e o pódio de ciclos anteriores são visíveis a todo mundo.
router.get('/', validateRequest({ query: ListCyclesQuerySchema }), asyncHandler(CycleController.list));
router.get('/current', asyncHandler(CycleController.getCurrent));
router.get('/:id', asyncHandler(CycleController.getById));

// Escrita — restrita a ADMIN/ADMIN_MASTER (configura o ciclo e os prêmios,
// mesmo padrão de Modalidades/Níveis/Desafios).
router.post('/', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), validateRequest({ body: CreateCycleSchema }), asyncHandler(CycleController.create));
router.patch('/:id', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), validateRequest({ body: UpdateCycleSchema }), asyncHandler(CycleController.update));
router.put('/:id/prizes', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), validateRequest({ body: CyclePrizeSchema }), asyncHandler(CycleController.upsertPrize));
router.post('/:id/cancel', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(CycleController.cancel));
router.delete('/:id', ensureAuthenticated, requireRoles(['ADMIN', 'ADMIN_MASTER']), asyncHandler(CycleController.delete));

export { router as cycleRoutes };
