import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { EvidenceService } from './evidence.service';

function isAdminRequest(req: Request): boolean {
  return req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));
}

export class EvidenceController {
  /** POST /activities/:id/evidence — Envia um arquivo de evidência (multipart/form-data, campo "file") */
  static async upload(req: Request, res: Response) {
    const { id: activityId } = req.params;
    const userId = req.user!.id;

    if (!req.file) {
      throw new AppError('Nenhum arquivo foi enviado. Utilize o campo "file".', 422, 'FILE_REQUIRED');
    }

    const evidence = await EvidenceService.upload(activityId, userId, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    return sendSuccess(res, evidence, 201);
  }

  /** GET /activities/:id/evidence — Lista as evidências (metadados) de uma atividade */
  static async list(req: Request, res: Response) {
    const { id: activityId } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);

    const evidences = await EvidenceService.listByActivity(activityId, userId, isAdmin);
    return sendSuccess(res, evidences, 200, { total: evidences.length });
  }

  /** GET /activities/:id/evidence/:evidenceId/download — Download autorizado do arquivo */
  static async download(req: Request, res: Response) {
    const { id: activityId, evidenceId } = req.params;
    const userId = req.user!.id;
    const isAdmin = isAdminRequest(req);

    const { buffer, fileName, fileType } = await EvidenceService.getFileForDownload(
      activityId,
      evidenceId,
      userId,
      isAdmin,
    );

    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buffer);
  }
}
