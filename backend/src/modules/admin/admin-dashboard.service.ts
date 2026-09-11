import { prisma } from '../../config/database';
import { RankingService } from '../ranking/ranking.service';

const TREND_DAYS = 30;
const TOP_RANKING_SIZE = 5;
const MONTH_LABELS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Sem horário de verão no Brasil desde 2019 — um offset fixo é suficiente e
// evita depender do fuso horário configurado no servidor (em produção,
// tipicamente UTC), que faria os "dias" do gráfico não bater com o dia
// corrido de quem está olhando o painel do Brasil.
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Instante cujo valor UTC representa a hora "de Brasília" — usar sempre com
 * os getters/setters *UTC* (getUTCDate, setUTCMonth, etc.) daqui em diante,
 * nunca os locais (que dependeriam do fuso do servidor). */
function toBrazilShifted(date: Date): Date {
  return new Date(date.getTime() + BRAZIL_OFFSET_MS);
}

function brazilDayKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 10);
}

function brazilMonthKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 7);
}

function brazilYearKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 4);
}

export class AdminDashboardService {
  /**
   * Painel administrativo — indicadores e gráficos agregados de todo o
   * sistema, sempre calculados a partir do banco (nunca em cache).
   * planejamento.md Fase 21/"21. PAINEL ADMINISTRATIVO".
   */
  public static async get() {
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
      this.getActivitiesOverTime(),
      this.getPointsHistory(),
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
      charts: {
        activitiesOverTime,
        pointsHistory,
        activitiesByModality,
        usersByDepartment,
        redemptionsByStatus,
      },
    };
  }

  private static async getActivityCountsByStatus() {
    const grouped = await prisma.userActivity.groupBy({ by: ['status'], _count: { _all: true } });
    const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
    return {
      total,
      pending: byStatus.get('PENDING') ?? 0,
      approved: byStatus.get('APPROVED') ?? 0,
      rejected: byStatus.get('REJECTED') ?? 0,
      cancelled: byStatus.get('CANCELLED') ?? 0,
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

  private static async getActivitiesByModality() {
    const grouped = await prisma.userActivity.groupBy({
      by: ['activityTypeId'],
      where: { status: 'APPROVED' },
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

  /** Atividades aprovadas por dia, últimos 30 dias — tendência de engajamento do sistema. */
  private static async getActivitiesOverTime() {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));
    windowStart.setHours(0, 0, 0, 0);

    const activities = await prisma.userActivity.findMany({
      where: { status: 'APPROVED', validatedAt: { gte: windowStart } },
      select: { validatedAt: true },
    });

    const countByDay = new Map<string, number>();
    for (const a of activities) {
      if (!a.validatedAt) continue;
      const key = toDateKey(a.validatedAt);
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }

    const series: Array<{ date: string; approvedCount: number }> = [];
    for (let i = 0; i < TREND_DAYS; i++) {
      const day = new Date(windowStart);
      day.setDate(windowStart.getDate() + i);
      const key = toDateKey(day);
      series.push({ date: key, approvedCount: countByDay.get(key) ?? 0 });
    }
    return series;
  }

  /**
   * Pontos concedidos (positivos) a QUALQUER usuário, agrupados por dia,
   * mês e ano — não cumulativo (é o total daquele período específico, não
   * um saldo acumulado). Calcula os três de uma vez, sem round-trip extra
   * ao banco, pra a pessoa poder trocar a granularidade direto no gráfico
   * (planejamento a pedido do usuário).
   *
   * A bucketização usa o fuso de Brasília fixo (BRAZIL_OFFSET_MS), não o
   * fuso do servidor — em produção o servidor tipicamente roda em UTC, o
   * que faria os "dias" do gráfico não baterem com o dia corrido de quem
   * está no Brasil olhando o painel.
   */
  private static async getPointsHistory() {
    const now = new Date();
    const earliestStart = new Date(now.getFullYear() - 3, 0, 1); // cobre os 3 anos exibidos, com folga

    const transactions = await prisma.pointsTransaction.findMany({
      where: { points: { gt: 0 }, createdAt: { gte: earliestStart } },
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

    // Âncora "de hoje" já deslocada — dali em diante só getUTC*/setUTC*,
    // nunca os métodos locais (que dependeriam do fuso do servidor).
    const nowShifted = toBrazilShifted(now);

    const day: Array<{ date: string; label: string; points: number }> = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(nowShifted);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      day.push({ date: key, label, points: pointsByDay.get(key) ?? 0 });
    }

    const month: Array<{ date: string; label: string; points: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowShifted);
      d.setUTCMonth(d.getUTCMonth() - i, 1); // dia 1 evita estouro (ex.: 31/mar - 1 mês)
      const key = d.toISOString().slice(0, 7);
      const label = `${MONTH_LABELS_SHORT[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
      month.push({ date: key, label, points: pointsByMonth.get(key) ?? 0 });
    }

    const year: Array<{ date: string; label: string; points: number }> = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(nowShifted);
      d.setUTCFullYear(d.getUTCFullYear() - i);
      const key = String(d.getUTCFullYear());
      year.push({ date: key, label: key, points: pointsByYear.get(key) ?? 0 });
    }

    return { day, month, year };
  }
}
