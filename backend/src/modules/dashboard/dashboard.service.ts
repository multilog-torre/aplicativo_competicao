import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import {
  brazilDayKey,
  brazilMonthKey,
  brazilYearKey,
  clamp,
  dayKeyAndLabelAt,
  MAX_DAY_BUCKETS,
  MAX_MONTH_BUCKETS,
  MAX_YEAR_BUCKETS,
  monthKeyAndLabelAt,
  resolveBucketCount,
  toBrazilShifted,
  yearKeyAndLabelAt,
} from '../../shared/utils/dateWindows';
import { RankingService } from '../ranking/ranking.service';
import { GetDashboardQueryDTO } from './dashboard.dto';

const POINTS_HISTORY_DEFAULT_DAYS = 30;
const POINTS_HISTORY_DEFAULT_MONTHS = 12;
const PERFORMANCE_WEEKS = 8;

/** Filtros já resolvidos — cycleId, se informado, já foi traduzido para um
 * dateFrom/dateTo concreto (ver DashboardService.resolveFilters). */
interface ResolvedFilters {
  dateFrom?: Date;
  dateTo?: Date;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Início (segunda-feira, 00:00) da semana ISO que contém `date`. */
function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=dom, 1=seg...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export class DashboardService {
  /**
   * Agrega tudo que o Dashboard do participante precisa em uma única chamada,
   * sempre com dados reais vindos do banco (nunca calculado/cacheado no
   * frontend) — planejamento.md Fase 18/"18. DASHBOARD".
   */
  public static async getForUser(userId: string, activityLimit: number, rawFilters: GetDashboardQueryDTO = {} as GetDashboardQueryDTO) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { level: true },
    });
    if (!user) {
      // Não deveria ocorrer (usuário já autenticado), mas mantém o contrato defensivo.
      throw new Error(`Usuário '${userId}' não encontrado ao montar o dashboard.`);
    }

    const filters = await this.resolveFilters(rawFilters);

    const [leaderboard, recentActivities, pointsHistory, activitiesByModality, performanceByPeriod] =
      await Promise.all([
        RankingService.getGeneralLeaderboard(),
        this.getRecentActivities(userId, activityLimit),
        this.getPersonalPointsHistory(userId, filters, user.createdAt),
        this.getActivitiesByModality(userId, filters),
        this.getPerformanceByPeriod(userId),
      ]);

    const myIndex = leaderboard.findIndex((entry) => entry.id === userId);
    const position = myIndex === -1 ? null : myIndex + 1;

    const nextLevel = await prisma.level.findFirst({
      where: { minPoints: { gt: user.totalPoints } },
      orderBy: { minPoints: 'asc' },
    });

    return {
      points: { total: user.totalPoints },
      ranking: {
        position,
        totalParticipants: leaderboard.length,
      },
      level: {
        current: user.level
          ? { id: user.level.id, levelNumber: user.level.levelNumber, name: user.level.name, badgeIcon: user.level.badgeIcon, minPoints: user.level.minPoints }
          : null,
        next: nextLevel
          ? { id: nextLevel.id, name: nextLevel.name, minPoints: nextLevel.minPoints, pointsNeeded: nextLevel.minPoints - user.totalPoints }
          : null,
        progress: { current: user.totalPoints, target: nextLevel?.minPoints ?? null },
      },
      recentActivities,
      filtersApplied: {
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
      },
      charts: {
        pointsHistory,
        activitiesByModality,
        // "Evolução no ranking" exigiria snapshots históricos de posição, que não
        // fazem parte do schema aprovado na Fase 1 (mesma limitação documentada
        // nas Fases 10 e 16). Retornado explicitamente como indisponível, em vez
        // de omitido silenciosamente ou preenchido com dado fabricado.
        rankingEvolution: null as null,
        rankingEvolutionNote:
          'Indisponível nesta versão: exigiria uma tabela de histórico de posições, fora do schema aprovado até o momento.',
        performanceByPeriod,
      },
      motivationalMessage: this.buildMotivationalMessage(leaderboard, myIndex, user.totalPoints),
    };
  }

  /** Traduz o DTO bruto (query string) em filtros prontos pros gráficos —
   * em especial, resolve `cycleId` para o dateFrom/dateTo exato daquele
   * ciclo de premiação (prioridade sobre dateFrom/dateTo explícitos, caso
   * os dois venham juntos). */
  private static async resolveFilters(raw: GetDashboardQueryDTO): Promise<ResolvedFilters> {
    if (raw.cycleId) {
      const cycle = await prisma.awardCycle.findUnique({ where: { id: raw.cycleId }, select: { startDate: true, endDate: true } });
      if (!cycle) throw new NotFoundError(`Ciclo com ID '${raw.cycleId}' não foi encontrado.`);
      return { dateFrom: cycle.startDate, dateTo: cycle.endDate };
    }
    return { dateFrom: raw.dateFrom, dateTo: raw.dateTo };
  }

  private static async getRecentActivities(userId: string, limit: number) {
    const activities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { activityType: { select: { name: true, icon: true } } },
    });

    return activities.map((a) => ({
      id: a.id,
      activityTypeName: a.activityType.name,
      icon: a.activityType.icon,
      quantity: a.quantity,
      unit: a.unit,
      calculatedPoints: a.calculatedPoints,
      status: a.status,
      activityDate: a.activityDate,
      createdAt: a.createdAt,
    }));
  }

  /**
   * "Evolução de pontos" da própria pessoa — saldo ACUMULADO (não o ganho
   * daquele período) em três granularidades (dia/mês/ano), pra ela poder
   * acompanhar todo o progresso desde que começou, exatamente como o
   * gráfico equivalente do Painel Geral (getTopUsersEvolution), só que
   * escopado a um único usuário.
   *
   * Sem filtro de data: dia/mês usam a janela padrão (30 dias/12 meses,
   * terminando hoje); ANO cobre desde o ano em que a conta foi criada até
   * hoje — é o que dá a visão de "toda a jornada" sem exigir que a pessoa
   * aplique um filtro. Com filtro de data/ciclo, as três granularidades
   * passam a cobrir exatamente o período escolhido (mesmo comportamento
   * do Painel Geral).
   *
   * O saldo é NET (soma de TODAS as transações, positivas e negativas) —
   * precisa bater com `points.total` exibido no card do topo, não só o que
   * foi ganho.
   */
  private static async getPersonalPointsHistory(userId: string, filters: ResolvedFilters, accountCreatedAt: Date) {
    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId },
      select: { points: true, createdAt: true },
    });

    const lifetimeTotal = transactions.reduce((sum, tx) => sum + tx.points, 0);
    const pointsByDay = new Map<string, number>();
    const pointsByMonth = new Map<string, number>();
    const pointsByYear = new Map<string, number>();
    for (const tx of transactions) {
      const dKey = brazilDayKey(tx.createdAt);
      const mKey = brazilMonthKey(tx.createdAt);
      const yKey = brazilYearKey(tx.createdAt);
      pointsByDay.set(dKey, (pointsByDay.get(dKey) ?? 0) + tx.points);
      pointsByMonth.set(mKey, (pointsByMonth.get(mKey) ?? 0) + tx.points);
      pointsByYear.set(yKey, (pointsByYear.get(yKey) ?? 0) + tx.points);
    }

    const now = new Date();
    const toShifted = filters.dateTo ? toBrazilShifted(filters.dateTo) : toBrazilShifted(now);
    const dayCount = resolveBucketCount(filters, toShifted, 'day', POINTS_HISTORY_DEFAULT_DAYS, MAX_DAY_BUCKETS);
    const monthCount = resolveBucketCount(filters, toShifted, 'month', POINTS_HISTORY_DEFAULT_MONTHS, MAX_MONTH_BUCKETS);
    // "Ano" sem filtro cobre desde a criação da conta (não um padrão fixo de
    // 3 anos) — é o que dá "todo o progresso desde que começou".
    const accountCreatedShifted = toBrazilShifted(accountCreatedAt);
    const defaultYearCount = clamp(toShifted.getUTCFullYear() - accountCreatedShifted.getUTCFullYear() + 1, 1, MAX_YEAR_BUCKETS);
    const yearCount = resolveBucketCount(filters, toShifted, 'year', defaultYearCount, MAX_YEAR_BUCKETS);

    function buildSeries(
      periodMap: Map<string, number>,
      count: number,
      keyAndLabelAt: (i: number) => { date: string; label: string },
    ) {
      const keys: Array<{ date: string; label: string }> = [];
      for (let i = count - 1; i >= 0; i--) keys.push(keyAndLabelAt(i));
      const shownSum = keys.reduce((sum, k) => sum + (periodMap.get(k.date) ?? 0), 0);
      let cumulative = lifetimeTotal - shownSum;
      return keys.map((k) => {
        cumulative += periodMap.get(k.date) ?? 0;
        return { date: k.date, label: k.label, points: cumulative };
      });
    }

    return {
      day: buildSeries(pointsByDay, dayCount, (i) => dayKeyAndLabelAt(toShifted, i)),
      month: buildSeries(pointsByMonth, monthCount, (i) => monthKeyAndLabelAt(toShifted, i)),
      year: buildSeries(pointsByYear, yearCount, (i) => yearKeyAndLabelAt(toShifted, i)),
    };
  }

  /** Atividades aprovadas agrupadas por modalidade (gráfico "Atividades por
   * modalidade") — respeita o mesmo filtro de data/ciclo do gráfico de
   * evolução, pra continuar consistente quando a pessoa muda o período. */
  private static async getActivitiesByModality(userId: string, filters: ResolvedFilters) {
    const grouped = await prisma.userActivity.groupBy({
      by: ['activityTypeId'],
      where: {
        userId,
        status: 'APPROVED',
        ...(filters.dateFrom || filters.dateTo ? { validatedAt: { gte: filters.dateFrom, lte: filters.dateTo } } : {}),
      },
      _count: { _all: true },
      _sum: { calculatedPoints: true },
    });

    if (grouped.length === 0) return [];

    const activityTypes = await prisma.activityType.findMany({
      where: { id: { in: grouped.map((g) => g.activityTypeId) } },
      select: { id: true, name: true, icon: true },
    });
    const typeById = new Map(activityTypes.map((t) => [t.id, t]));

    return grouped
      .map((g) => ({
        activityTypeId: g.activityTypeId,
        activityTypeName: typeById.get(g.activityTypeId)?.name ?? 'Modalidade removida',
        icon: typeById.get(g.activityTypeId)?.icon ?? 'activity',
        count: g._count._all,
        totalPoints: g._sum.calculatedPoints ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Pontos ganhos por semana, últimas 8 semanas (gráfico "Desempenho por período"). */
  private static async getPerformanceByPeriod(userId: string) {
    const now = new Date();
    const windowStart = startOfIsoWeek(now);
    windowStart.setDate(windowStart.getDate() - 7 * (PERFORMANCE_WEEKS - 1));

    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId, createdAt: { gte: windowStart } },
      select: { points: true, createdAt: true },
    });

    const pointsByWeekStart = new Map<string, number>();
    for (const tx of transactions) {
      const key = toDateKey(startOfIsoWeek(tx.createdAt));
      pointsByWeekStart.set(key, (pointsByWeekStart.get(key) ?? 0) + tx.points);
    }

    const series: Array<{ weekStart: string; points: number }> = [];
    for (let i = 0; i < PERFORMANCE_WEEKS; i++) {
      const weekStart = new Date(windowStart);
      weekStart.setDate(windowStart.getDate() + 7 * i);
      const key = toDateKey(weekStart);
      series.push({ weekStart: key, points: pointsByWeekStart.get(key) ?? 0 });
    }

    return series;
  }

  /** Mensagem dinâmica motivacional, baseada na posição real do usuário no ranking. */
  private static buildMotivationalMessage(
    leaderboard: Array<{ id: string; name: string; points: number }>,
    myIndex: number,
    myPoints: number,
  ): string {
    if (myPoints === 0) {
      return '🚀 Registre sua primeira atividade e comece a pontuar!';
    }

    if (myIndex === -1) {
      return '👋 Continue participando para aparecer no ranking!';
    }

    if (myIndex === 0) {
      return '🏆 Você está em 1º lugar no ranking geral! Continue assim!';
    }

    const ahead = leaderboard[myIndex - 1];
    const gap = ahead.points - myPoints;
    const aheadPosition = myIndex; // ranked[myIndex-1] está na posição myIndex (1-indexado)

    if (gap <= 0) {
      return `⚖️ Você está empatado com o ${aheadPosition}º colocado!`;
    }

    return `🔥 Você está a apenas ${gap} ponto${gap === 1 ? '' : 's'} do ${aheadPosition}º colocado!`;
  }
}
