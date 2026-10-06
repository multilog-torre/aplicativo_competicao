import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { TransactionClient } from '../../shared/types/prisma';
import { ListRankingQueryDTO } from './ranking.dto';

/** Calcula a data de início do período solicitado, relativa a agora. */
function getPeriodStart(period: string, now: Date): Date | null {
  if (period === 'GENERAL') return null;

  if (period === 'WEEK') {
    const dayOfWeek = now.getDay(); // 0=dom, 1=seg...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  }

  if (period === 'MONTH') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (period === 'YEAR') {
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  return null;
}

export interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarType: string;
  avatarUrl: string | null;
  department: { id: string; name: string } | null;
  points: number;
  totalPointsAllTime: number;
}

export interface LeaderboardEntryLite {
  id: string;
  name: string;
  points: number;
  avatarType: string;
  avatarUrl: string | null;
}

export class RankingService {
  /**
   * Leaderboard GERAL (placar de competição, sem filtro de período) já
   * ordenado — mesma regra de empate usada em `list()` (pontos desc, nome
   * asc). Base compartilhada por `getGeneralPosition` (Fase 16 — "subida no
   * ranking") e pelo Dashboard (Fase 17 — posição atual e mensagem
   * motivacional), evitando duplicar a mesma agregação em múltiplos lugares.
   *
   * Lê `User.totalPoints` diretamente — é literalmente o mesmo "placar de
   * competição" que o Dashboard e o Perfil mostram (ver
   * points-application.util.ts), já mantido corretamente a cada transação
   * (inclusive reset de ciclo). ANTES recalculava somando o ledger com
   * `cycleId != null`, só que o próprio lançamento `CYCLE_RESET` nasce com
   * `cycleId = null` (de propósito — é a exceção que sempre conta) e por
   * isso ficava de fora dessa soma: o reset nunca era descontado, e o
   * ranking continuava empilhando pontos de ciclos já encerrados pra
   * sempre (bug relatado pelo usuário, confirmado ao vivo — ver ciclos.md).
   */
  public static async getGeneralLeaderboard(externalTx?: TransactionClient): Promise<LeaderboardEntryLite[]> {
    const client = externalTx ?? prisma;
    const users = await client.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, avatarType: true, avatarUrl: true, totalPoints: true },
    });

    return users
      .map((u) => ({ id: u.id, name: u.name, points: u.totalPoints, avatarType: u.avatarType, avatarUrl: u.avatarUrl }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'pt-BR'));
  }

  /** Posição do usuário no ranking GERAL — usada pela Fase 16 ("subida no ranking"). */
  public static async getGeneralPosition(userId: string, externalTx?: TransactionClient): Promise<number | null> {
    const ranked = await this.getGeneralLeaderboard(externalTx);
    const index = ranked.findIndex((r) => r.id === userId);
    return index === -1 ? null : index + 1;
  }

  /**
   * Ranking dinâmico — nunca a partir de um valor em cache no frontend.
   *
   * GERAL sem filtro de modalidade: lê `User.totalPoints` direto (mesma
   * razão de `getGeneralLeaderboard` acima — é o placar de competição já
   * mantido corretamente a cada transação, reset de ciclo incluso).
   *
   * Semana/Mês/Ano, ou GERAL com `activityTypeId` (não dá pra usar
   * `totalPoints`, que não é nem recortado por data nem por modalidade):
   * soma do ledger no período, com o MESMO critério de inclusão que
   * `applyPointsToUser` usa pra decidir o que conta pro `totalPoints`
   * (points-application.util.ts) — sempre inclui `CYCLE_RESET` e
   * `REVERSAL`/débitos (`points < 0`), além de ganhos com `cycleId`
   * preenchido. Isso corrige o bug relatado pelo usuário: ANTES só exigia
   * `cycleId != null`, o que deixava o `CYCLE_RESET` (que nasce com
   * `cycleId = null` de propósito) fora da soma — o reset nunca era
   * descontado e o período continuava empilhando pontos de ciclos já
   * encerrados pra sempre.
   *
   * Regra de empate: pontuações iguais são ordenadas alfabeticamente pelo nome.
   */
  public static async list(query: ListRankingQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.activityTypeId) {
      const activityType = await prisma.activityType.findUnique({ where: { id: query.activityTypeId } });
      if (!activityType) {
        throw new NotFoundError(`Modalidade com ID '${query.activityTypeId}' não foi encontrada.`);
      }
    }

    if (query.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: query.departmentId } });
      if (!department) {
        throw new NotFoundError(`Departamento com ID '${query.departmentId}' não foi encontrado.`);
      }
    }

    const periodStart = getPeriodStart(query.period, new Date());
    const needsLedgerSum = periodStart !== null || !!query.activityTypeId;

    let sumByUser = new Map<string, number>();
    if (needsLedgerSum) {
      const transactionWhere: Record<string, unknown> = {
        OR: [{ transactionType: 'CYCLE_RESET' }, { transactionType: 'REVERSAL' }, { points: { lt: 0 } }, { cycleId: { not: null } }],
      };
      if (periodStart) transactionWhere.createdAt = { gte: periodStart };
      if (query.activityTypeId) transactionWhere.activity = { activityTypeId: query.activityTypeId };

      const sums = await prisma.pointsTransaction.groupBy({
        by: ['userId'],
        where: transactionWhere,
        _sum: { points: true },
      });
      sumByUser = new Map(sums.map((s) => [s.userId, s._sum.points ?? 0]));
    }

    // Candidatos: todos os usuários ativos (do departamento filtrado, se houver),
    // incluídos mesmo com 0 pontos no período — para exibir a posição completa.
    const candidates = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
      select: {
        id: true,
        name: true,
        avatarType: true,
        avatarUrl: true,
        totalPoints: true,
        lifetimePoints: true,
        department: { select: { id: true, name: true } },
      },
    });

    const ranked = candidates
      .map((user) => ({
        userId: user.id,
        name: user.name,
        avatarType: user.avatarType,
        avatarUrl: user.avatarUrl,
        department: user.department,
        points: needsLedgerSum ? (sumByUser.get(user.id) ?? 0) : user.totalPoints,
        totalPointsAllTime: user.lifetimePoints,
      }))
      // Empate: quem tem mais pontos vem primeiro; em caso de igualdade, ordem alfabética pelo nome.
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'pt-BR'));

    const entries: RankingEntry[] = ranked.map((entry, index) => ({ position: index + 1, ...entry }));

    const total = entries.length;
    const skip = (page - 1) * limit;
    const paginated = entries.slice(skip, skip + limit);

    return {
      entries: paginated,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
