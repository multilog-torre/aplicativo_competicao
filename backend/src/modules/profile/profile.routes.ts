import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { uploadSingleFile } from '../../shared/middlewares/uploadMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { ProfileController } from './profile.controller';
import { ChangePasswordSchema, SetAvatarSchema, UpdateProfileSchema } from './profile.dto';

const router = Router();

// Perfil é sempre conteúdo autenticado — colegas podem ver o perfil um do outro
// (mesmos dados já expostos publicamente pelo /ranking), mas nunca sem login.
router.use(ensureAuthenticated);

// 1. Perfil próprio (completo) e autoedição de nome/cargo/departamento
router.get('/', asyncHandler(ProfileController.getOwn));
router.patch('/', validateRequest({ body: UpdateProfileSchema }), asyncHandler(ProfileController.updateOwn));
router.patch('/password', validateRequest({ body: ChangePasswordSchema }), asyncHandler(ProfileController.changePassword));

// 2. Catálogo de avatares pré-definidos e troca de avatar
// (precisam vir ANTES de '/:userId' para não colidir com o parâmetro genérico)
router.get('/avatar-presets', asyncHandler(ProfileController.listAvatarPresets));
router.patch('/avatar', uploadSingleFile, validateRequest({ body: SetAvatarSchema }), asyncHandler(ProfileController.setAvatar));

// 3. Foto de avatar enviada (UPLOAD) e perfil público de outro usuário
router.get('/:userId/avatar', asyncHandler(ProfileController.getAvatar));
router.get('/:userId', asyncHandler(ProfileController.getByUserId));

export { router as profileRoutes };
