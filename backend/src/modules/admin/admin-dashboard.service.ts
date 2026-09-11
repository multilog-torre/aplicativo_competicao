import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import {
  BRAZIL_OFFSET_MS,
  brazilDayKey,
  brazilMonthKey,
  brazilYearKey,
  buildQueryDateRange,
  clamp,
  dayKeyAndLabelAt,
  monthKeyAndLabelAt,
  resolveBucketCount,
  toBrazilShifted,
  yearKeyAndLabelAt,
} from '../../shared/utils/dateWindows';
import { RankingService } from '../ranking/ranking.service';
import { DashboardFiltersDTO } from './admin-dashboard.dto';

const TREND_DAYS = 30;
const TREND_MONTHS = 12;
const TREND_YEARS = 3;
const TOP_RANKING_SIZE = 5;
const TOP_ACTIVITIES_SIZE = 5;
const TOP_USERS_EVOLUTION_SIZE = 5;
// Tetos de segurança — um filtro de data mal-intencionado ou muito amplo não
// pode gerar um array absurdamente grande na resposta.
const MAX_DAY_BUCKETS = 366;
const MAX_MONTH_BUCKETS = 36;
const MAX_YEAR_BUCKETS = 10;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Filtros já resolvidos (cycleId, se informado, já foi traduzido para um
 * dateFrom/dateTo concreto — ver AdminDashboardService.resolveFilters). Os
 * métodos de gráfico só lidam com este formato, nunca com o DTO bruto.
 */
interface ResolvedFilters {
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  departmentId?: string;
  activityTypeId?: string;
}

export class AdminDashboardService {
  /**
   * Painel administrativo — indicadores e gráficos agregados de todo o
   * sistema, sempre calculados a partir do banco (nunca em cache).
   * planejamento.md Fase 21/"21. PAINEL ADMINISTRATIVO".
   *
   * `rawFilters` (data/ciclo/usuário/departamento/atividade) afeta apenas
   * os GRÁFICOS (charts) — os indicadores do topo continuam sendo o
   * retrato atual/geral da empresa, sem filtro (decisão combinada com o
   * usuário: os cards são contadores "ao vivo", filtrá-los mudaria o
   * significado deles de forma confusa).
   */
  public static async get(rawFilters: DashboardFiltersDTO = {}) {
    const filters = await this.resolveFilters(rawFilters);

    const [
      totalUsers,
      activeUsers,
      activityCountsByStatus,
      pendingRedemptions,
      pointsTotals,
      activitiesByModality,
      challengeCounts,
      rewardsCatalogCount,
      totalRedemptions,
      usersByDepartment,
      redemptionsByStatus,
      leaderboard,
      activitiesOverTime,
      pointsHistory,
      topActivities,
      topUsersEvolution,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.getActivityCountsByStatus(),
      prisma.userReward.count({ where: { status: 'REQUESTED' } }),
      this.getPointsTotals(),
      this.getActivitiesByModality(),
      this.getChallengeCounts(),
      prisma.reward.count({ where: { status: { not: 'INACTIVE' } } }),
      prisma.userReward.count(),
      this.getUsersByDepartment(),
      this.getRedemptionsByStatus(),
      RankingService.getGeneralLeaderboard(),
      this.getActivitiesOverTime(filters),
      this.getPointsHistory(filters),
      this.getActivitiesByModality(filters),
      this.getTopUsersEvolution(filters),
    ]);

    const topModality = activitiesByModality[0] ?? null;

    return {
      indicators: {
        totalUsers,
        activeUsers,
        activities: activityCountsByStatus,
        pendingRedemptions,
        points: pointsTotals,
        topModality,
        challenges: challengeCounts,
        rewardsCatalogCount,
        totalRedemptions,
      },
      topRanking: leaderboard.slice(0, TOP_RANKING_SIZE).map((entry, index) => ({ position: index + 1, ...entry })),
      filtersApplied: {
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        userId: filters.userId ?? null,
        departmentId: filters.departmentId ?? null,
        activityTypeId: filters.activityTypeId ?? null,
      },
      charts: {
        activitiesOverTime,
        pointsHistory,
        activitiesByModality,
        topActivities: topActivities.slice(0, TOP_ACTIVITIES_SIZE),
        topUsersEvolution,
        usersByDepartment,
        redemptionsByStatus,
      },
    };
  }

  /** Traduz o DTO bruto (query string) em filtros prontos pros gráficos —
   * em especial, resolve `cycleId` para o dateFrom/dateTo exato daquele
   * ciclo de premiação (que tem prioridade sobre dateFrom/dateTo
   * explícitos, caso os dois venham juntos). */
  private static async resolveFilters(raw: DashboardFiltersDTO): Promise<ResolvedFilters> {
    if (raw.cycleId) {
      const cycle = await prisma.awardCycle.findUnique({ where: { id: raw.cycleId }, select: { startDate: true, endDate: true } });
      if (!cycle) throw new NotFoundError(`Ciclo com ID '${raw.cycleId}' não foi encontrado.`);
      return {
        dateFrom: cycle.startDate,
        dateTo: cycle.endDate,
        userId: raw.userId,
        departmentId: raw.departmentId,
        activityTypeId: raw.activityTypeId,
      };
    }
    return {
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      userId: raw.userId,
      departmentId: raw.departmentId,
      activityTypeId: raw.activityTypeId,
    };
  }

  private static async getActivityCountsByStatus() {
    const grouped = await prisma.userActivity.groupBy({ by: ['status'], _count: { _all: true } });
    const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);

    // "Aprovadas hoje" é um indicador AO VIVO (não filtrado) — antes vinha do
    // último ponto de charts.activitiesOverTime, mas esse gráfico passou a
    // respeitar os filtros do painel; se ficasse lá, um filtro de data
    // mudaria "hoje" pra "o último dia da janela filtrada", o que quebraria
    // a regra combinada com o usuário (indicadores nunca são filtrados).
    const now = new Date();
    const todayShifted = toBrazilShifted(now).toISOString().slice(0, 10);
    // Inverte o deslocamento pra achar o instante UTC real da meia-noite de
    // Brasília (que é 03:00 UTC, já que BRAZIL_OFFSET_MS é -3h).
    const todayStartUtc = new Date(new Date(`${todayShifted}T00:00:00.000Z`).getTime() - BRAZIL_OFFSET_MS);
    const approvedToday = await prisma.userActivity.count({
      where: { status: 'APPROVED', validatedAt: { gte: todayStartUtc } },
    });

    return {
      total,
      pending: byStatus.get('PENDING') ?? 0,
      approved: byStatus.get('APPROVED') ?? 0,
      rejected: byStatus.get('REJECTED') ?? 0,
      cancelled: byStatus.get('CANCELLED') ?? 0,
      approvedToday,
    };
  }

  private static async getPointsTotals() {
    const [distributedAgg, netAgg] = await Promise.all([
      prisma.pointsTransaction.aggregate({ where: { points: { gt: 0 } }, _sum: { points: true } }),
      prisma.pointsTransaction.aggregate({ _sum: { points: true } }),
    ]);
    return {
      totalDistributed: distributedAgg._sum.points ?? 0, // soma bruta de tudo que já foi concedido
      netCirculating: netAgg._sum.points ?? 0, // saldo líquido após penalidades/estornos/resgates
    };
  }

  /**
   * Atividades aprovadas agrupadas por modalidade. Sem `filters`, é a base
   * usada pelos INDICADORES (topModality) — sempre geral/sem filtro, por
   * isso essa chamada some argumento nenhum. Com `filters`, é a mesma
   * consulta só que restrita ao recorte escolhido no painel, usada pelo
   * gráfico "Top 5 atividades mais realizadas" (charts.topActivities).
   */
  private static async getActivitiesByModality(filters?: ResolvedFilters) {
    const grouped = await prisma.userActivity.groupBy({
      by: ['activityTypeId'],
      where: {
        status: 'APPROVED',
        ...(filters?.dateFrom || filters?.dateTo
          ? { validatedAt: { gte: filters?.dateFrom, lte: filters?.dateTo } }
          : {}),
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.departmentId ? { user: { departmentId: filters.departmentId } } : {}),
        ...(filters?.activityTypeId ? { activityTypeId: filters.activityTypeId } : {}),
      },
      _count: { _all: true },
    });
    if (grouped.length === 0) return [];

    const types = await prisma.activityType.findMany({
      where: { id: { in: grouped.map((g) => g.activityTypeId) } },
      select: { id: true, name: true, icon: true },
    });
    const typeById = new Map(types.map((t) => [t.id, t]));

    return grouped
      .map((g) => ({
        activityTypeId: g.activityTypeId,
        name: typeById.get(g.activityTypeId)?.name ?? 'Modalidade removida',
        icon: typeById.get(g.activityTypeId)?.icon ?? 'activity',
        approvedCount: g._count._all,
      }))
      .sort((a, b) => b.approvedCount - a.approvedCount);
  }

  private static async getChallengeCounts() {
    const now = new Date();
    const [total, active, completedParticipations] = await Promise.all([
      prisma.challenge.count(),
      prisma.challenge.count({ where: { status: { not: 'CANCELLED' }, startDate: { lte: now }, endDate: { gte: now } } }),
      prisma.challengeParticipant.count({ where: { completed: true } }),
    ]);
    return { total, active, completedParticipations };
  }

  private static async getUsersByDepartment() {
    const departments = await prisma.department.findMany({
      select: { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return departments.map((d) => ({ departmentId: d.id, departmentName: d.name, count: d._count.users }));
  }

  private static async getRedemptionsByStatus() {
    const grouped = await prisma.userReward.groupBy({ by: ['status'], _count: { _all: true } });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  /** Atividades aprovadas por dia — tendência de engajamento do sistema.
   * Sem filtro de data: últimos 30 dias (comportamento original,
   * preservado). Com filtro: exatamente o período escolhido. */
  private static async getActivitiesOverTime(filters: ResolvedFilters) {
    const now = new Date();
    let windowStart: Date;
    let windowEnd: Date | undefined;
    let days: number;

    if (filters.dateFrom || filters.dateTo) {
      windowEnd = filters.dateTo ? new Date(filters.dateTo) : new Date(now);
      windowStart = filters.dateFrom ? new Date(filters.dateFrom) : new Date(windowEnd);
      if (!filters.dateFrom) windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));
      windowStart.setHours(0, 0, 0, 0);
      days = clamp(Math.floor((windowEnd.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)) + 1, 1, MAX_DAY_BUCKETS);
    } else {
      windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));
      windowStart.setHours(0, 0, 0, 0);
      days = TREND_DAYS;
    }

    const activities = await prisma.userActivity.findMany({
      where: {
        status: 'APPROVED',
        validatedAt: { gte: windowStart, ...(windowEnd ? { lte: windowEnd } : {}) },
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.departmentId ? { user: { departmentId: filters.departmentId } } : {}),
        ...(filters.activityTypeId ? { activityTypeId: filters.activityTypeId } : {}),
      },
      select: { validatedAt: true },
    });

    const countByDay = new Map<string, number>();
    for (const a of activities) {
      if (!a.validatedAt) continue;
      const key = toDateKey(a.validatedAt);
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }

    const series: Array<{ date: string; approvedCount: number }> = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(windowStart);
      day.setDate(windowStart.getDate() + i);
      const key = toDateKey(day);
      series.push({ date: key, approvedCount: countByDay.get(key) ?? 0 });
    }
    return series;
  }

  /**
   * Pontos concedidos (positivos) a QUALQUER usuário (ou só ao usuário/
   * departamento/atividade filtrado), agrupados por dia, mês e ano — não
   * cumulativo (é o total daquele período específico, não um saldo
   * acumulado). Calcula os três de uma vez, sem round-trip extra ao banco,
   * pra a pessoa poder trocar a granularidade direto no gráfico.
   *
   * Sem filtro de data: janelas padrão (30 dias/12 meses/3 anos, terminando
   * hoje — comportamento original, preservado). Com filtro de data/ciclo:
   * as três granularidades passam a cobrir exatamente o período escolhido.
   *
   * A bucketização usa o fuso de Brasília fixo (BRAZIL_OFFSET_MS), não o
   * fuso do servidor — em produção o servidor tipicamente roda em UTC, o
   * que faria os "dias" do gráfico não baterem com o dia corrido de quem
   * está no Brasil olhando o painel.
   */
  private static async getPointsHistory(filters: ResolvedFilters) {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear() - TREND_YEARS, 0, 1); // cobre os 3 anos exibidos por padrão, com folga
    const dateRange = buildQueryDateRange(filters, defaultFrom);

    const transactions = await prisma.pointsTransaction.findMany({
      where: {
        points: { gt: 0 },
        createdAt: dateRange,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.departmentId ? { user: { departmentId: filters.departmentId } } : {}),
        ...(filters.activityTypeId ? { activity: { activityTypeId: filters.activityTypeId } } : {}),
      },
      select: { points: true, createdAt: true },
    });

    const pointsByDay = new Map<string, number>();
    const pointsByMonth = new Map<string, number>();
    const pointsByYear = new Map<string, number>();
    for (const tx of transactions) {
      const dayKey = brazilDayKey(tx.createdAt);
      const monthKey = brazilMonthKey(tx.createdAt);
      const yearKey = brazilYearKey(tx.createdAt);
      pointsByDay.set(dayKey, (pointsByDay.get(dayKey) ?? 0) + tx.points);
      pointsByMonth.set(monthKey, (pointsByMonth.get(monthKey) ?? 0) + tx.points);
      pointsByYear.set(yearKey, (pointsByYear.get(yearKey) ?? 0) + tx.points);
    }

    // Âncora "final" já deslocada — hoje, ou o `dateTo` do filtro. Dali em
    // diante só getUTC*/setUTC*, nunca os métodos locais (que dependeriam
    // do fuso do servidor).
    const toShifted = filters.dateTo ? toBrazilShifted(filters.dateTo) : toBrazilShifted(now);
    const dayCount = resolveBucketCount(filters, toShifted, 'day', TREND_DAYS, MAX_DAY_BUCKETS);
    const monthCount = resolveBucketCount(filters, toShifted, 'month', TREND_MONTHS, MAX_MONTH_BUCKETS);
    const yearCount = resolveBucketCount(filters, toShifted, 'year', TREND_YEARS, MAX_YEAR_BUCKETS);

    const day: Array<{ date: string; label: string; points: number }> = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const { date, label } = dayKeyAndLabelAt(toShifted, i);
      day.push({ date, label, points: pointsByDay.get(date) ?? 0 });
    }

    const month: Array<{ date: string; label: string; points: number }> = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const { date, label } = monthKeyAndLabelAt(toShifted, i);
      month.push({ date, label, points: pointsByMonth.get(date) ?? 0 });
    }

    const year: Array<{ date: string; label: string; points: number }> = [];
    for (let i = yearCount - 1; i >= 0; i--) {
      const { date, label } = yearKeyAndLabelAt(toShifted, i);
      year.push({ date, label, points: pointsByYear.get(date) ?? 0 });
    }

    return { day, month, year };
  }

  /**
   * "Evolução dos usuários" — quem está com mais pontos, dia a dia/mês a
   * mês/ano a ano: uma linha por usuário (o saldo ACUMULADO dele naquele
   * momento, não o ganho daquele período), pros top 5 usuários por pontos
   * atuais (ou só o usuário filtrado, se `filters.userId` estiver ativo —
   * é o que alimenta o clique-para-filtrar no nome do usuário).
   *
   * Busca o histórico completo (sem limite de data) de cada usuário
   * escolhido pra poder calcular corretamente o saldo acumulado em CADA
   * uma das três granularidades — um filtro de data só restringe a JANELA
   * exibida, nunca o que conta pro saldo anterior a ela (senão o gráfico
   * mostraria um salto artificial no início da janela).
   */
  private static async getTopUsersEvolution(filters: ResolvedFilters) {
    let userIds: string[];
    if (filters.userId) {
      userIds = [filters.userId];
    } else {
      const topUsers = await prisma.user.findMany({
        where: { status: 'ACTIVE', ...(filters.departmentId ? { departmentId: filters.departmentId } : {}) },
        orderBy: [{ totalPoints: 'desc' }, { name: 'asc' }],
        take: TOP_USERS_EVOLUTION_SIZE,
        select: { id: true },
      });
      userIds = topUsers.map((u) => u.id);
    }

    const empty = { day: [], month: [], year: [] } as {
      day: Array<{ userId: string; name: string; series: Array<{ date: string; label: string; points: number }> }>;
      month: Array<{ userId: string; name: string; series: Array<{ date: string; label: string; points: number }> }>;
      year: Array<{ userId: string; name: string; series: Array<{ date: string; label: string; points: number }> }>;
    };
    if (userIds.length === 0) return empty;

    const usersInfo = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameById = new Map(usersInfo.map((u) => [u.id, u.name]));

    // Diferente de getPointsHistory (que só soma o que foi CONCEDIDO,
    // positivo), aqui a série precisa ser o saldo NET de cada usuário —
    // incluindo PENALTY/REVERSAL/CYCLE_RESET/ADJUSTMENT — pra bater com o
    // mesmo totalPoints já exibido no ranking. "Quem está com mais pontos"
    // só faz sentido comparando o saldo real, não o total bruto distribuído.
    const transactions = await prisma.pointsTransaction.findMany({
      where: {
        userId: { in: userIds },
        ...(filters.activityTypeId ? { activity: { activityTypeId: filters.activityTypeId } } : {}),
      },
      select: { userId: true, points: true, createdAt: true },
    });

    const lifetimeTotalByUser = new Map<string, number>();
    const perUserDay = new Map<string, Map<string, number>>();
    const perUserMonth = new Map<string, Map<string, number>>();
    const perUserYear = new Map<string, Map<string, number>>();
    for (const uid of userIds) {
      perUserDay.set(uid, new Map());
      perUserMonth.set(uid, new Map());
      perUserYear.set(uid, new Map());
    }
    for (const tx of transactions) {
      lifetimeTotalByUser.set(tx.userId, (lifetimeTotalByUser.get(tx.userId) ?? 0) + tx.points);
      const dMap = perUserDay.get(tx.userId);
      const mMap = perUserMonth.get(tx.userId);
      const yMap = perUserYear.get(tx.userId);
      const dKey = brazilDayKey(tx.createdAt);
      const mKey = brazilMonthKey(tx.createdAt);
      const yKey = brazilYearKey(tx.createdAt);
      if (dMap) dMap.set(dKey, (dMap.get(dKey) ?? 0) + tx.points);
      if (mMap) mMap.set(mKey, (mMap.get(mKey) ?? 0) + tx.points);
      if (yMap) yMap.set(yKey, (yMap.get(yKey) ?? 0) + tx.points);
    }

    const now = new Date();
    const toShifted = filters.dateTo ? toBrazilShifted(filters.dateTo) : toBrazilShifted(now);
    const dayCount = resolveBucketCount(filters, toShifted, 'day', TREND_DAYS, MAX_DAY_BUCKETS);
    const monthCount = resolveBucketCount(filters, toShifted, 'month', TREND_MONTHS, MAX_MONTH_BUCKETS);
    const yearCount = resolveBucketCount(filters, toShifted, 'year', TREND_YEARS, MAX_YEAR_BUCKETS);

    /** Constrói a série acumulada de cada usuário pra uma granularidade: o
     * "saldo antes da janela" é o total vitalício MENOS o que a própria
     * janela exibida já vai somar — assim o valor do último ponto sempre
     * bate com o saldo real do usuário até aquele instante, sem precisar
     * de uma segunda consulta ao banco por granularidade. */
    function buildSeries(
      periodMapByUser: Map<string, Map<string, number>>,
      count: number,
      keyAndLabelAt: (i: number) => { date: string; label: string },
    ) {
      const keys: Array<{ date: string; label: string }> = [];
      for (let i = count - 1; i >= 0; i--) keys.push(keyAndLabelAt(i));

      return userIds.map((uid) => {
        const periodMap = periodMapByUser.get(uid) ?? new Map<string, number>();
        const shownSum = keys.reduce((sum, k) => sum + (periodMap.get(k.date) ?? 0), 0);
        let cumulative = (lifetimeTotalByUser.get(uid) ?? 0) - shownSum;
        const series = keys.map((k) => {
          cumulative += periodMap.get(k.date) ?? 0;
          return { date: k.date, label: k.label, points: cumulative };
        });
        return { userId: uid, name: nameById.get(uid) ?? 'Usuário removido', series };
      });
    }

    return {
      day: buildSeries(perUserDay, dayCount, (i) => dayKeyAndLabelAt(toShifted, i)),
      month: buildSeries(perUserMonth, monthCount, (i) => monthKeyAndLabelAt(toShifted, i)),
      year: buildSeries(perUserYear, yearCount, (i) => yearKeyAndLabelAt(toShifted, i)),
    };
  }
}
