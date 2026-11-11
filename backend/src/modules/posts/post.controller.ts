import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { PostService } from './post.service';
import { CreatePostDTO, DeletePostDTO, ListPostsQueryDTO, ModeratePostDTO, SetReactionDTO } from './post.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class PostController {
  public static async create(req: Request, res: Response): Promise<Response> {
    const { content, eventId } = req.body as CreatePostDTO;
    const userId = req.user!.id;
    const post = await PostService.create(userId, content, isAdminRequest(req), req.file, eventId);
    return sendSuccess(res, post, 201);
  }

  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListPostsQueryDTO;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const result = await PostService.list(query, userId, isAdmin);
    return sendSuccess(res, result.posts, 200, result.pagination);
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const post = await PostService.getById(id, userId, isAdmin);
    return sendSuccess(res, post, 200);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const { reason } = (req.body ?? {}) as DeletePostDTO;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const result = await PostService.delete(id, userId, isAdmin, reason);
    return sendSuccess(res, result, 200);
  }

  public static async moderate(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const dto = req.body as ModeratePostDTO;
    const adminId = req.user!.id;
    const post = await PostService.moderate(id, dto, adminId);
    return sendSuccess(res, post, 200);
  }

  public static async getImage(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const thumbnail = req.query.thumb === '1';
    const { buffer } = await PostService.getImageForDownload(id, userId, isAdmin, thumbnail);
    res.setHeader('Content-Type', 'image/jpeg');
    // Foto de post nunca é editada depois de publicada (só criada/excluída) — pode
    // cachear por bastante tempo sem risco de mostrar versão desatualizada.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(buffer);
  }

  /** GET /posts/:id/file — arquivo original anexado (hoje só relevante pro PDF; a foto já é servida por getImage). */
  public static async getFile(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const { buffer, attachmentType } = await PostService.getFileForDownload(id, userId, isAdmin);
    res.setHeader('Content-Type', attachmentType === 'PDF' ? 'application/pdf' : 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(buffer);
  }

  public static async setReaction(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const { emoji } = req.body as SetReactionDTO;
    const userId = req.user!.id;
    const reaction = await PostService.setReaction(id, userId, emoji, isAdminRequest(req));
    return sendSuccess(res, reaction, 201);
  }

  public static async removeReaction(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const result = await PostService.removeReaction(id, userId, isAdminRequest(req));
    return sendSuccess(res, result, 200);
  }

  public static async listReactions(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const userId = req.user!.id;
    const page = parseInt((req.query.page as string) ?? '1', 10) || 1;
    const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10) || 20, 100);
    const result = await PostService.listReactions(id, userId, isAdminRequest(req), page, limit);
    return sendSuccess(res, result.reactions, 200, result.pagination);
  }
}
