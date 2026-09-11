import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { UploadedFile } from '../../shared/types/upload';
import { assertAllowedFile } from '../../shared/utils/fileValidation';
import { assertEventGroupAccess } from '../events/event-access.util';
import { getStorageProvider } from '../storage/storage.factory';
import { ListPostsQueryDTO, ModeratePostDTO } from './post.dto';

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];

const MODERATION_ACTION_TO_STATUS: Record<string, string> = {
  HIDE: 'HIDDEN',
  MODERATE: 'MODERATED',
  RESTORE: 'PUBLISHED',
};

type PostRow = {
  id: string;
  userId: string;
  content: string;
  imageUrl: string | null;
  status: string;
  eventId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null };
  _count: { comments: number; likes: number };
};

export class PostService {
  /**
   * Cria uma publicação no mural, opcionalmente com uma foto anexada.
   * A foto reaproveita o mesmo StorageProvider das evidências (Fase 7) —
   * privado por padrão, servido apenas pelo endpoint de download autorizado.
   */
  public static async create(userId: string, content: string, isAdmin: boolean, file?: UploadedFile, eventId?: string) {
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) throw new NotFoundError(`Evento com ID '${eventId}' não foi encontrado.`);
      await assertEventGroupAccess(eventId, userId, isAdmin);
    }

    const postId = uuidv4();
    let imageUrl: string | null = null;

    if (file) {
      assertAllowedFile(file, ALLOWED_IMAGE_EXTENSIONS);
      const storage = getStorageProvider();
      const { storagePath } = await storage.save({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: `mural/${postId}`,
      });
      imageUrl = storagePath;
    }

    const post = await prisma.post.create({
      data: { id: postId, userId, content, imageUrl, status: 'PUBLISHED', eventId: eventId ?? null },
      include: {
        user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });

    return this.toPublicShape(post, userId, false);
  }

  public static async list(query: ListPostsQueryDTO, requestingUserId: string, isAdmin: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    if (query.eventId) {
      await assertEventGroupAccess(query.eventId, requestingUserId, isAdmin);
    }

    // Admin pode consultar a fila de moderação (HIDDEN/MODERATED) via ?status=.
    // Participante sempre vê publicações PUBLISHED de todos + as próprias, seja
    // qual for o status (para saber se algo seu foi moderado). O Mural geral
    // (sem eventId) nunca mistura com os grupos de evento, e vice-versa.
    const where: Record<string, unknown> =
      isAdmin && query.status
        ? { status: query.status }
        : { OR: [{ status: 'PUBLISHED' }, { userId: requestingUserId }] };
    where.eventId = query.eventId ?? null;

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } },
          _count: { select: { comments: true, likes: true } },
        },
      }),
    ]);

    const likedPostIds = await this.getLikedPostIds(
      requestingUserId,
      posts.map((p) => p.id),
    );

    return {
      posts: posts.map((p) => this.toPublicShape(p, requestingUserId, likedPostIds.has(p.id))),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  public static async getById(id: string, requestingUserId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });
    if (!post) throw new NotFoundError(`Publicação com ID '${id}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    if (post.status !== 'PUBLISHED' && !isAdmin && post.userId !== requestingUserId) {
      throw new ForbiddenError('Esta publicação não está mais disponível.');
    }

    const likedPostIds = await this.getLikedPostIds(requestingUserId, [id]);
    return this.toPublicShape(post, requestingUserId, likedPostIds.has(id));
  }

  /** Exclusão pelo dono (rotina, sem auditoria) ou moderação administrativa (auditada). */
  public static async delete(id: string, requestingUserId: string, isAdmin: boolean, reason?: string) {
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundError(`Publicação com ID '${id}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    const isOwner = post.userId === requestingUserId;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Você não tem permissão para excluir a publicação de outro usuário.');
    }

    await prisma.post.delete({ where: { id } }); // cascade remove comentários/curtidas (schema)

    if (isAdmin && !isOwner) {
      await prisma.auditLog.create({
        data: {
          userId: requestingUserId,
          action: 'DELETE_POST',
          entity: 'Post',
          entityId: id,
          oldValues: JSON.stringify(post),
          newValues: JSON.stringify({ reason: reason ?? null }),
        },
      });
    }

    return { message: 'Publicação excluída com sucesso.' };
  }

  /** Moderação administrativa: oculta, marca como moderada ou restaura uma publicação. */
  public static async moderate(id: string, dto: ModeratePostDTO, adminId: string) {
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundError(`Publicação com ID '${id}' não foi encontrada.`);

    const newStatus = MODERATION_ACTION_TO_STATUS[dto.action];
    const updated = await prisma.post.update({ where: { id }, data: { status: newStatus } });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'MODERATE_POST',
        entity: 'Post',
        entityId: id,
        oldValues: JSON.stringify({ status: post.status }),
        newValues: JSON.stringify({ status: newStatus, moderationAction: dto.action, reason: dto.reason ?? null }),
      },
    });

    return updated;
  }

  /** Recupera o conteúdo binário da foto do post (acesso autorizado, mesmo padrão da Fase 7). */
  public static async getImageForDownload(postId: string, requestingUserId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || !post.imageUrl) throw new NotFoundError('Esta publicação não possui uma foto.');
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    if (post.status !== 'PUBLISHED' && !isAdmin && post.userId !== requestingUserId) {
      throw new ForbiddenError('Esta publicação não está mais disponível.');
    }

    const storage = getStorageProvider();
    const buffer = await storage.read(post.imageUrl);
    return { buffer };
  }

  // ─── Curtidas ────────────────────────────────────────────────────────────────

  public static async like(postId: string, userId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing) throw new AppError('Você já curtiu esta publicação.', 409, 'ALREADY_LIKED');

    return prisma.postLike.create({ data: { postId, userId } });
  }

  public static async unlike(postId: string, userId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });
    if (!existing) throw new NotFoundError('Você ainda não curtiu esta publicação.');

    await prisma.postLike.delete({ where: { id: existing.id } });
    return { message: 'Curtida removida com sucesso.' };
  }

  public static async listLikes(postId: string, requestingUserId: string, isAdmin: boolean, page: number, limit: number) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    const skip = (page - 1) * limit;
    const [total, likes] = await Promise.all([
      prisma.postLike.count({ where: { postId } }),
      prisma.postLike.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } },
      }),
    ]);

    return { likes, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Helpers internos ──────────────────────────────────────────────────────────

  private static async getLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const likes = await prisma.postLike.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(likes.map((l) => l.postId));
  }

  private static toPublicShape(post: PostRow, _requestingUserId: string, likedByMe: boolean) {
    return {
      id: post.id,
      user: post.user,
      content: post.content,
      eventId: post.eventId,
      hasImage: !!post.imageUrl,
      imageDownloadUrl: post.imageUrl ? `/api/v1/posts/${post.id}/image` : null,
      status: post.status,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      likedByMe,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
}
