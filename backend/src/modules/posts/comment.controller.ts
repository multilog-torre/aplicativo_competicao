import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { CommentService } from './comment.service';
import { CreateCommentDTO, ListCommentsQueryDTO } from './comment.dto';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class CommentController {
  public static async create(req: Request, res: Response): Promise<Response> {
    const { id: postId } = req.params;
    const { content } = req.body as CreateCommentDTO;
    const userId = req.user!.id;
    const comment = await CommentService.create(postId, userId, content);
    return sendSuccess(res, comment, 201);
  }

  public static async list(req: Request, res: Response): Promise<Response> {
    const { id: postId } = req.params;
    const query = req.query as unknown as ListCommentsQueryDTO;
    const result = await CommentService.list(postId, query.page ?? 1, query.limit ?? 20);
    return sendSuccess(res, result.comments, 200, result.pagination);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id: postId, commentId } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);
    const result = await CommentService.delete(postId, commentId, userId, isAdmin);
    return sendSuccess(res, result, 200);
  }
}
