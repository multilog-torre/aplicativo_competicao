import { Router } from 'express';
import { ensureAuthenticated, requireRoles } from '../../shared/middlewares/authMiddleware';
import { uploadSingleFile } from '../../shared/middlewares/uploadMiddleware';
import { validateRequest } from '../../shared/middlewares/validateRequest';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { CommentController } from './comment.controller';
import { CreateCommentSchema, ListCommentsQuerySchema } from './comment.dto';
import { PostController } from './post.controller';
import { CreatePostSchema, ListPostsQuerySchema, ModeratePostSchema } from './post.dto';

const router = Router();

// O mural é conteúdo interno da corporação — toda rota exige autenticação
// (diferente de /levels, /achievements etc., que são catálogos públicos).
router.use(ensureAuthenticated);

// 1. Publicações
router.get('/', validateRequest({ query: ListPostsQuerySchema }), asyncHandler(PostController.list));

router.post(
  '/',
  uploadSingleFile,
  validateRequest({ body: CreatePostSchema }),
  asyncHandler(PostController.create),
);

router.get('/:id', asyncHandler(PostController.getById));
router.delete('/:id', asyncHandler(PostController.delete));
router.get('/:id/image', asyncHandler(PostController.getImage));

router.post(
  '/:id/moderate',
  requireRoles(['ADMIN', 'ADMIN_MASTER']),
  validateRequest({ body: ModeratePostSchema }),
  asyncHandler(PostController.moderate),
);

// 2. Curtidas
router.post('/:id/like', asyncHandler(PostController.like));
router.delete('/:id/like', asyncHandler(PostController.unlike));
router.get('/:id/likes', asyncHandler(PostController.listLikes));

// 3. Comentários
router.post(
  '/:id/comments',
  validateRequest({ body: CreateCommentSchema }),
  asyncHandler(CommentController.create),
);
router.get(
  '/:id/comments',
  validateRequest({ query: ListCommentsQuerySchema }),
  asyncHandler(CommentController.list),
);
router.delete('/:id/comments/:commentId', asyncHandler(CommentController.delete));

export { router as postRoutes };
