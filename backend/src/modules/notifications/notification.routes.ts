import { Router } from 'express';
import { ensureAuthenticated } from '../../shared/middlewares/authMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { NotificationController } from './notification.controller';
import { ListNotificationsQuerySchema } from './notification.dto';

const router = Router();

// Notificações são sempre pessoais — toda rota exige autenticação e é sempre
// escopada ao próprio usuário (sem parâmetro de userId, nem para admin).
router.use(ensureAuthenticated);

router.get('/', validateRequest({ query: ListNotificationsQuerySchema }), asyncHandler(NotificationController.list));
router.get('/unread-count', asyncHandler(NotificationController.getUnreadCount));
router.post('/read-all', asyncHandler(NotificationController.markAllAsRead));
router.post('/:id/read', asyncHandler(NotificationController.markAsRead));
router.delete('/:id', asyncHandler(NotificationController.delete));

export { router as notificationRoutes };
