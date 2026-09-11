import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { assertEventGroupAccess } from '../events/event-access.util';

export class CommentService {
  public static async create(postId: string, userId: string, content: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    if (post.status !== 'PUBLISHED') {
      throw new AppError('Não é possível comentar em uma publicação que não está mais disponível.', 422, 'POST_NOT_COMMENTABLE');
    }

    return prisma.comment.create({
      data: { postId, userId, content },
      include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } },
    });
  }

  public static async list(postId: string, userId: string, isAdmin: boolean, page: number, limit: number) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    const skip = (page - 1) * limit;
    const [total, comments] = await Promise.all([
      prisma.comment.count({ where: { postId } }),
      prisma.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } },
      }),
    ]);

    return { comments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  public static async delete(postId: string, commentId: string, requestingUserId: string, isAdmin: boolean) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.postId !== postId) {
      throw new NotFoundError(`Comentário com ID '${commentId}' não foi encontrado.`);
    }

    const isOwner = comment.userId === requestingUserId;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Você não tem permissão para excluir o comentário de outro usuário.');
    }

    await prisma.comment.delete({ where: { id: commentId } });

    if (isAdmin && !isOwner) {
      await prisma.auditLog.create({
        data: {
          userId: requestingUserId,
          action: 'MODERATE_COMMENT',
          entity: 'Comment',
          entityId: commentId,
          oldValues: JSON.stringify(comment),
        },
      });
    }

    return { message: 'Comentário excluído com sucesso.' };
  }
}
