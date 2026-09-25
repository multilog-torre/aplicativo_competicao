import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { EventEvidenceService } from './event-evidence.service';
import { EventService } from './event.service';
import {
  ApproveEventDTO,
  ConfirmAttendanceDTO,
  CreateEventDTO,
  ListEventsQueryDTO,
  RejectEventDTO,
  UpdateEventDTO,
} from './event.dto';

function isAdminRequest(req: Request): boolean {
  return req.user?.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role)) ?? false;
}

export class EventController {
  public static async list(req: Request, res: Response): Promise<Response> {
    const query = req.query as unknown as ListEventsQueryDTO;
    const events = await EventService.list(query, req.user?.id ?? null, isAdminRequest(req));
    return sendSuccess(res, events, 200, { total: events.length });
  }

  public static async getById(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const event = await EventService.getById(id, req.user?.id ?? null, isAdminRequest(req));
    return sendSuccess(res, event, 200);
  }

  public static async create(req: Request, res: Response): Promise<Response> {
    const data = req.body as CreateEventDTO;
    const event = await EventService.create(data, req.user!.id);
    return sendSuccess(res, event, 201);
  }

  public static async delete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const result = await EventService.delete(id, req.user!.id, isAdminRequest(req));
    return sendSuccess(res, result, 200);
  }

  public static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as UpdateEventDTO;
    const event = await EventService.update(id, data, req.user!.id, isAdminRequest(req));
    return sendSuccess(res, event, 200);
  }

  public static async approve(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as ApproveEventDTO;
    const event = await EventService.approve(id, data, req.user!.id);
    return sendSuccess(res, event, 200);
  }

  public static async reject(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as RejectEventDTO;
    const event = await EventService.reject(id, data, req.user!.id);
    return sendSuccess(res, event, 200);
  }

  public static async cancel(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const event = await EventService.cancel(id, req.user!.id);
    return sendSuccess(res, event, 200);
  }

  public static async join(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const participant = await EventService.join(id, req.user!.id);
    return sendSuccess(res, participant, 201);
  }

  public static async leave(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const result = await EventService.leave(id, req.user!.id);
    return sendSuccess(res, result, 200);
  }

  public static async listParticipants(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const participants = await EventService.listParticipants(id, req.user?.id ?? null, isAdminRequest(req));
    return sendSuccess(res, participants, 200, { total: participants.length });
  }

  public static async confirmAttendance(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    const data = req.body as ConfirmAttendanceDTO;
    const event = await EventService.confirmAttendance(id, data, req.user!.id);
    return sendSuccess(res, event, 200);
  }

  /** POST /events/:id/evidence — Envia evidência (multipart/form-data, campo "file") de que esteve no evento */
  public static async uploadEvidence(req: Request, res: Response): Promise<Response> {
    const { id: eventId } = req.params;

    if (!req.file) {
      throw new AppError('Nenhum arquivo foi enviado. Utilize o campo "file".', 422, 'FILE_REQUIRED');
    }

    const evidence = await EventEvidenceService.upload(eventId, req.user!.id, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    return sendSuccess(res, evidence, 201);
  }

  /** GET /events/:id/evidence — Lista as evidências que EU (usuário logado) enviei pra este evento */
  public static async listMyEvidence(req: Request, res: Response): Promise<Response> {
    const { id: eventId } = req.params;
    const evidences = await EventEvidenceService.listMine(eventId, req.user!.id);
    return sendSuccess(res, evidences, 200, { total: evidences.length });
  }

  /** GET /events/:id/evidence/:evidenceId/download — Download autorizado do arquivo */
  public static async downloadEvidence(req: Request, res: Response): Promise<Response> {
    const { id: eventId, evidenceId } = req.params;
    const { buffer, fileName, fileType } = await EventEvidenceService.getFileForDownload(
      eventId,
      evidenceId,
      req.user!.id,
      isAdminRequest(req),
    );

    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buffer);
  }
}
