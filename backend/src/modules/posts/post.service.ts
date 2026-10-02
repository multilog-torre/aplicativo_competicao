import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { TransactionClient } from '../../shared/types/prisma';
import { UploadedFile } from '../../shared/types/upload';
import { assertAllowedFile } from '../../shared/utils/fileValidation';
import { assertEventGroupAccess } from '../events/event-access.util';
import { NotificationService } from '../notifications/notification.service';
import { getStorageProvider } from '../storage/storage.factory';
import { ListPostsQueryDTO, ModeratePostDTO, ReactionEmojiCode } from './post.dto';

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
  activityId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null };
  activity: {
    quantity: number;
    unit: string | null;
    calculatedPoints: number;
    activityDate: Date;
    submittedAt: Date;
    activityType: { name: string; icon: string | null };
  } | null;
  _count: { comments: number; reactions: number };
};

type ReactionInfo = { summary: { emoji: ReactionEmojiCode; count: number }[]; myReaction: ReactionEmojiCode | null };

const POST_INCLUDE = {
  user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } as const,
  activity: {
    select: {
      quantity: true,
      unit: true,
      calculatedPoints: true,
      activityDate: true,
      submittedAt: true,
      activityType: { select: { name: true, icon: true } },
    },
  } as const,
  _count: { select: { comments: true, reactions: true } } as const,
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
      include: POST_INCLUDE,
    });

    return this.toPublicShape(post, { summary: [], myReaction: null });
  }

  /**
   * Cria automaticamente o post de "atividade aprovada" no Mural geral,
   * dentro da MESMA transação atômica de `AdminActivityService.approve()`.
   * Se a atividade tiver uma evidência em formato de imagem, ela é copiada
   * para o storage do próprio post (mesma pasta/mecanismo de uma foto
   * manual) — assim a foto passa a valer as regras de acesso do Post
   * (público a qualquer autenticado quando PUBLISHED), sem afrouxar o
   * acesso privado da evidência original em activity_evidence.
   */
  public static async createFromActivity(
    params: {
      userId: string;
      activityId: string;
      content: string;
      imageSource?: { buffer: Buffer; fileName: string; mimeType: string };
    },
    tx: TransactionClient,
  ) {
    const postId = uuidv4();
    let imageUrl: string | null = null;

    if (params.imageSource) {
      const storage = getStorageProvider();
      const { storagePath } = await storage.save({
        buffer: params.imageSource.buffer,
        originalName: params.imageSource.fileName,
        mimeType: params.imageSource.mimeType,
        folder: `mural/${postId}`,
      });
      imageUrl = storagePath;
    }

    return tx.post.create({
      data: {
        id: postId,
        userId: params.userId,
        content: params.content,
        imageUrl,
        status: 'PUBLISHED',
        eventId: null,
        activityId: params.activityId,
      },
    });
  }

  /**
   * Anexa a foto de uma evidência que chegou DEPOIS que o post automático já
   * tinha sido criado sem foto — cenário comum quando a modalidade não
   * exige evidência (a auto-aprovação roda no ato de criar a atividade,
   * antes de qualquer evidência opcional existir) e a pessoa anexa uma foto
   * mesmo assim logo em seguida (chamado por EvidenceService.upload). Não
   * faz nada se não houver post vinculado a essa atividade, ou se o post já
   * tiver uma foto — a primeira evidência de imagem "ganha", não fica
   * trocando a cada novo anexo.
   */
  public static async attachEvidenceImageIfMissing(
    activityId: string,
    imageSource: { buffer: Buffer; fileName: string; mimeType: string },
  ): Promise<void> {
    const post = await prisma.post.findFirst({ where: { activityId, imageUrl: null } });
    if (!post) return;

    const storage = getStorageProvider();
    const { storagePath } = await storage.save({
      buffer: imageSource.buffer,
      originalName: imageSource.fileName,
      mimeType: imageSource.mimeType,
      folder: `mural/${post.id}`,
    });

    await prisma.post.update({ where: { id: post.id }, data: { imageUrl: storagePath } });
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
        include: POST_INCLUDE,
      }),
    ]);

    const reactionsByPost = await this.getReactionsInfo(
      posts.map((p) => p.id),
      requestingUserId,
    );

    return {
      posts: posts.map((p) => this.toPublicShape(p, reactionsByPost.get(p.id) ?? { summary: [], myReaction: null })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  public static async getById(id: string, requestingUserId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!post) throw new NotFoundError(`Publicação com ID '${id}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    if (post.status !== 'PUBLISHED' && !isAdmin && post.userId !== requestingUserId) {
      throw new ForbiddenError('Esta publicação não está mais disponível.');
    }

    const reactionsByPost = await this.getReactionsInfo([id], requestingUserId);
    return this.toPublicShape(post, reactionsByPost.get(id) ?? { summary: [], myReaction: null });
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

    await prisma.post.delete({ where: { id } }); // cascade remove comentários/reações (schema)

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

  // ─── Reações ─────────────────────────────────────────────────────────────────

  /** Define (ou troca) a reação do usuário no post — 1 emoji por pessoa/post. */
  public static async setReaction(postId: string, userId: string, emoji: ReactionEmojiCode, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    if (post.status !== 'PUBLISHED' && !isAdmin && post.userId !== userId) {
      throw new AppError('Não é possível reagir a uma publicação que não está mais disponível.', 422, 'POST_NOT_REACTABLE');
    }

    const existing = await prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId } } });

    const reaction = await prisma.postReaction.upsert({
      where: { postId_userId: { postId, userId } },
      update: { emoji },
      create: { postId, userId, emoji },
    });

    // Notifica o dono do post só na primeira reação (não a cada troca de emoji) e nunca por reagir no próprio post.
    if (!existing && post.userId !== userId) {
      const reactor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await NotificationService.create({
        userId: post.userId,
        title: 'Nova reação na sua publicação',
        message: `${reactor?.name ?? 'Alguém'} reagiu ${emoji} à sua publicação.`,
        type: 'POST_REACTION',
        referenceId: postId,
      });
    }

    return reaction;
  }

  public static async removeReaction(postId: string, userId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, userId, isAdmin);

    const existing = await prisma.postReaction.findUnique({ where: { postId_userId: { postId, userId } } });
    if (!existing) throw new NotFoundError('Você ainda não reagiu a esta publicação.');

    await prisma.postReaction.delete({ where: { id: existing.id } });
    return { message: 'Reação removida com sucesso.' };
  }

  public static async listReactions(postId: string, requestingUserId: string, isAdmin: boolean, page: number, limit: number) {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError(`Publicação com ID '${postId}' não foi encontrada.`);
    await assertEventGroupAccess(post.eventId, requestingUserId, isAdmin);

    const skip = (page - 1) * limit;
    const [total, reactions] = await Promise.all([
      prisma.postReaction.count({ where: { postId } }),
      prisma.postReaction.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } },
      }),
    ]);

    return { reactions, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Helpers internos ──────────────────────────────────────────────────────────

  private static async getReactionsInfo(postIds: string[], requestingUserId: string): Promise<Map<string, ReactionInfo>> {
    const result = new Map<string, ReactionInfo>();
    if (postIds.length === 0) return result;

    for (const postId of postIds) result.set(postId, { summary: [], myReaction: null });

    const [grouped, mine] = await Promise.all([
      prisma.postReaction.groupBy({
        by: ['postId', 'emoji'],
        where: { postId: { in: postIds } },
        _count: { _all: true },
      }),
      prisma.postReaction.findMany({
        where: { userId: requestingUserId, postId: { in: postIds } },
        select: { postId: true, emoji: true },
      }),
    ]);

    for (const row of grouped) {
      const entry = result.get(row.postId);
      if (entry) entry.summary.push({ emoji: row.emoji as ReactionEmojiCode, count: row._count._all });
    }
    for (const m of mine) {
      const entry = result.get(m.postId);
      if (entry) entry.myReaction = m.emoji as ReactionEmojiCode;
    }

    return result;
  }

  private static toPublicShape(post: PostRow, reactionInfo: ReactionInfo) {
    return {
      id: post.id,
      user: post.user,
      content: post.content,
      eventId: post.eventId,
      hasImage: !!post.imageUrl,
      imageDownloadUrl: post.imageUrl ? `/api/v1/posts/${post.id}/image` : null,
      status: post.status,
      activity: post.activity
        ? {
            modality: post.activity.activityType.name,
            icon: post.activity.activityType.icon,
            quantity: post.activity.quantity,
            unit: post.activity.unit,
            points: post.activity.calculatedPoints,
            activityDate: post.activity.activityDate,
            submittedAt: post.activity.submittedAt,
          }
        : null,
      commentsCount: post._count.comments,
      reactionsCount: post._count.reactions,
      reactionsSummary: reactionInfo.summary,
      myReaction: reactionInfo.myReaction,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
}
