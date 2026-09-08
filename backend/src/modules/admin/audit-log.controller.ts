import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDTO } from './audit-log.dto';

export class AuditLogController {
  /** GET /admin/audit-logs — Lista a trilha de auditoria com filtros */
  static async list(req: Request, res: Response) {
    const query = req.query as unknown as ListAuditLogsQueryDTO;
    const result = await AuditLogService.list(query);
    return sendSuccess(res, result.logs, 200, result.pagination);
  }

  /** GET /admin/audit-logs/:id — Detalhe de um registro de auditoria */
  static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const log = await AuditLogService.getById(id);
    return sendSuccess(res, log, 200);
  }
}
