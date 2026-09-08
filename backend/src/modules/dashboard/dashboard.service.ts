import { prisma } from '../../config/database';
import { RankingService } from '../ranking/ranking.service';

const POINTS_EVOLUTION_DAYS = 30;
const PERFORMANCE_WEEKS = 8;

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
  public static async getForUser(userId: string, activityLimit: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { level: true },
    });
    if (!user) {
      // Não deveria ocorrer (usuário já autenticado), mas mantém o contrato defensivo.
      throw new Error(`Usuário '${userId}' não encontrado ao montar o dashboard.`);
    }

    const [leaderboard, recentActivities, pointsEvolution, activitiesByModality, performanceByPeriod] =
      await Promise.all([
        RankingService.getGeneralLeaderboard(),
        this.getRecentActivities(userId, activityLimit),
        this.getPointsEvolution(userId),
        this.getActivitiesByModality(userId),
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
      charts: {
        pointsEvolution,
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

  /** Série de pontos acumulados por dia, últimos 30 dias (gráfico "Evolução de pontos"). */
  private static async getPointsEvolution(userId: string) {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - (POINTS_EVOLUTION_DAYS - 1));
    windowStart.setHours(0, 0, 0, 0);

    const [baselineAgg, windowTransactions] = await Promise.all([
      prisma.pointsTransaction.aggregate({
        where: { userId, createdAt: { lt: windowStart } },
        _sum: { points: true },
      }),
      prisma.pointsTransaction.findMany({
        where: { userId, createdAt: { gte: windowStart } },
        select: { points: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const pointsByDay = new Map<string, number>();
    for (const tx of windowTransactions) {
      const key = toDateKey(tx.createdAt);
      pointsByDay.set(key, (pointsByDay.get(key) ?? 0) + tx.points);
    }

    let cumulative = baselineAgg._sum.points ?? 0;
    const series: Array<{ date: string; cumulativePoints: number }> = [];
    for (let i = 0; i < POINTS_EVOLUTION_DAYS; i++) {
      const day = new Date(windowStart);
      day.setDate(windowStart.getDate() + i);
      const key = toDateKey(day);
      cumulative += pointsByDay.get(key) ?? 0;
      series.push({ date: key, cumulativePoints: cumulative });
    }

    return series;
  }

  /** Atividades aprovadas agrupadas por modalidade (gráfico "Atividades por modalidade"). */
  private static async getActivitiesByModality(userId: string) {
    const grouped = await prisma.userActivity.groupBy({
      by: ['activityTypeId'],
      where: { userId, status: 'APPROVED' },
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
