import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { assertEventGroupAccess } from '../events/event-access.util';
import { NotificationService } from '../notifications/notification.service';
import { ReactionEmojiCode } from './post.dto';

type ReactionInfo = { summary: { emoji: ReactionEmojiCode; count: number }[]; myReaction: ReactionEmojiCode | null };

const EMPTY_REACTION_INFO: ReactionInfo = { summary: [], myReaction: null };

const COMMENT_INCLUDE = {
  user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } as const,
};

export class CommentService {
  public static async create(postId: string, userId: string, content: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    if (post.status !== 'PUBLISHED') {
      throw new AppError('Não é possível comentar em uma publicação que não está mais disponível.', 422, 'POST_NOT_COMMENTABLE');
    }

    const comment = await prisma.comment.create({
      data: { postId, userId, content },
      include: COMMENT_INCLUDE,
    });

    // Notifica o dono do post, exceto quando ele mesmo comenta na própria publicação.
    if (post.userId !== userId) {
      await NotificationService.create({
        userId: post.userId,
        title: 'Novo comentário na sua publicação',
        message: `${comment.user.name} comentou: "${content.length > 80 ? `${content.slice(0, 80)}…` : content}"`,
        type: 'POST_COMMENT',
        referenceId: postId,
      });
    }

    return this.toPublicShape(comment, EMPTY_REACTION_INFO);
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
        include: COMMENT_INCLUDE,
      }),
    ]);

    const reactionsByComment = await this.getReactionsInfo(
      comments.map((c) => c.id),
      userId,
    );

    return {
      comments: comments.map((c) => this.toPublicShape(c, reactionsByComment.get(c.id) ?? EMPTY_REACTION_INFO)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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

    await prisma.comment.delete({ where: { id: commentId } }); // cascade remove reações (schema)

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

  // ─── Reações ─────────────────────────────────────────────────────────────────

  private static async findCommentOrThrow(postId: string, commentId: string) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: true } });
    if (!comment || comment.postId !== postId) {
      throw new NotFoundError(`Comentário com ID '${commentId}' não foi encontrado.`);
    }
    return comment;
  }

  /** Define (ou troca) a reação do usuário no comentário — 1 emoji por pessoa/comentário. */
  public static async setReaction(postId: string, commentId: string, userId: string, emoji: ReactionEmojiCode, isAdmin: boolean) {
    const comment = await this.findCommentOrThrow(postId, commentId);
    await assertEventGroupAccess(comment.post.eventId, userId, isAdmin);

    const existing = await prisma.commentReaction.findUnique({ where: { commentId_userId: { commentId, userId } } });

    const reaction = await prisma.commentReaction.upsert({
      where: { commentId_userId: { commentId, userId } },
      update: { emoji },
      create: { commentId, userId, emoji },
    });

    // Notifica o autor do comentário só na primeira reação (não a cada troca de emoji) e nunca por reagir no próprio comentário.
    if (!existing && comment.userId !== userId) {
      const reactor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await NotificationService.create({
        userId: comment.userId,
        title: 'Nova reação no seu comentário',
        message: `${reactor?.name ?? 'Alguém'} reagiu ${emoji} ao seu comentário.`,
        type: 'POST_REACTION',
        referenceId: postId,
      });
    }

    return reaction;
  }

  public static async removeReaction(postId: string, commentId: string, userId: string, isAdmin: boolean) {
    const comment = await this.findCommentOrThrow(postId, commentId);
    await assertEventGroupAccess(comment.post.eventId, userId, isAdmin);

    const existing = await prisma.commentReaction.findUnique({ where: { commentId_userId: { commentId, userId } } });
    if (!existing) throw new NotFoundError('Você ainda não reagiu a este comentário.');

    await prisma.commentReaction.delete({ where: { id: existing.id } });
    return { message: 'Reação removida com sucesso.' };
  }

  // ─── Helpers internos ──────────────────────────────────────────────────────────

  private static async getReactionsInfo(commentIds: string[], requestingUserId: string): Promise<Map<string, ReactionInfo>> {
    const result = new Map<string, ReactionInfo>();
    if (commentIds.length === 0) return result;

    for (const commentId of commentIds) result.set(commentId, { summary: [], myReaction: null });

    const [grouped, mine] = await Promise.all([
      prisma.commentReaction.groupBy({
        by: ['commentId', 'emoji'],
        where: { commentId: { in: commentIds } },
        _count: { _all: true },
      }),
      prisma.commentReaction.findMany({
        where: { userId: requestingUserId, commentId: { in: commentIds } },
        select: { commentId: true, emoji: true },
      }),
    ]);

    for (const row of grouped) {
      const entry = result.get(row.commentId);
      if (entry) entry.summary.push({ emoji: row.emoji, count: row._count._all });
    }
    for (const m of mine) {
      const entry = result.get(m.commentId);
      if (entry) entry.myReaction = m.emoji;
    }

    return result;
  }

  private static toPublicShape(
    comment: { id: string; postId: string; content: string; createdAt: Date; updatedAt: Date; user: { id: string; name: string; avatarType: string; avatarUrl: string | null } },
    reactionInfo: ReactionInfo,
  ) {
    return {
      id: comment.id,
      postId: comment.postId,
      content: comment.content,
      user: comment.user,
      reactionsCount: reactionInfo.summary.reduce((acc, r) => acc + r.count, 0),
      reactionsSummary: reactionInfo.summary,
      myReaction: reactionInfo.myReaction,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}
