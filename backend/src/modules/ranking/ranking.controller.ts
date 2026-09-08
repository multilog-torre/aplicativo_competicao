import { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { RankingService } from './ranking.service';
import { ListRankingQueryDTO } from './ranking.dto';

export class RankingController {
  /** GET /ranking — Ranking dinâmico com filtros de período, modalidade e departamento */
  static async list(req: Request, res: Response) {
    const query = req.query as unknown as ListRankingQueryDTO;
    const result = await RankingService.list(query);
    return sendSuccess(res, result.entries, 200, result.pagination);
  }
}
