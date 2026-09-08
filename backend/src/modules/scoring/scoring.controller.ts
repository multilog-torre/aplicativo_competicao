import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { ScoringService } from './scoring.service';
import {
  ListTransactionsQueryDTO,
  ManualTransactionDTO,
  ReversalDTO,
  SimulateScoreDTO,
} from './scoring.dto';

export class ScoringController {
  /** POST /scoring/simulate — Simula a pontuação antes de submeter a atividade */
  static async simulate(req: Request, res: Response) {
    const dto = req.body as SimulateScoreDTO;
    const userId = req.user!.id;

    const result = await ScoringService.simulate(dto, userId);
    return sendSuccess(res, result, 200);
  }

  /** POST /scoring/manual — Lançamento manual de BONUS, PENALTY ou ADJUSTMENT pelo admin */
  static async manualTransaction(req: Request, res: Response) {
    const dto = req.body as ManualTransactionDTO;
    const adminId = req.user!.id;

    const result = await ScoringService.manualTransaction(dto, adminId);
    return sendSuccess(res, result, 201);
  }

  /** POST /scoring/transactions/:id/reverse — Reverte uma transação (cria REVERSAL) */
  static async reverseTransaction(req: Request, res: Response) {
    const { id } = req.params;
    const dto = req.body as ReversalDTO;
    const adminId = req.user!.id;

    const result = await ScoringService.reverseTransaction(id, dto, adminId);
    return sendSuccess(res, result, 200);
  }

  /** GET /scoring/transactions — Histórico de transações de pontos */
  static async listTransactions(req: Request, res: Response) {
    const query = req.query as unknown as ListTransactionsQueryDTO;
    const userId = req.user!.id;
    const isAdmin = req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));

    const result = await ScoringService.listTransactions(query, userId, isAdmin);
    return sendSuccess(res, result, 200);
  }

  /** GET /scoring/transactions/:id — Detalhe de uma transação, com a origem resolvida (Fase 19) */
  static async getTransactionDetail(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.roles.some((role) => ['ADMIN', 'ADMIN_MASTER'].includes(role));

    const result = await ScoringService.getTransactionDetail(id, userId, isAdmin);
    return sendSuccess(res, result, 200);
  }
}
