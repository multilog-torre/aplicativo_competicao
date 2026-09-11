/**
 * FASE 20 — TESTES AUTOMATIZADOS DO PAINEL ADMINISTRATIVO
 *
 * Cobre:
 * 1. Painel exige autenticação (401 sem token)
 * 2. Participante também acessa o painel geral (200) — visão consolidada aberta a todos
 * 3. Admin acessa o painel (200)
 * 4. indicators.totalUsers/activeUsers batem com a contagem real do banco
 * 5. indicators.activities reflete corretamente pendências e aprovações
 * 6. indicators.pendingRedemptions reflete resgates aguardando aprovação
 * 7. indicators.points.netCirculating bate com a soma de todos os usuários
 * 8. indicators.topModality aponta a modalidade mais praticada corretamente
 * 9. indicators.challenges reflete desafios criados
 * 10. indicators.rewardsCatalogCount / totalRedemptions refletem o catálogo e resgates
 * 11. topRanking tem no máximo 5 posições, ordenado corretamente
 * 12. charts.activitiesOverTime tem 30 dias e reflete aprovação recente
 * 13. charts.pointsHistory (day/month/year) tem os tamanhos esperados e é sempre >= 0 (só positivos)
 * 14. charts.usersByDepartment soma o total de usuários ativos
 * 15. charts.redemptionsByStatus reflete o resgate criado
 * 16. charts.topActivities tem no máximo 5 modalidades, ordenado
 * 17. charts.topUsersEvolution (day/month/year) tem no máximo 5 usuários,
 *     cada série com o mesmo tamanho do pointsHistory correspondente
 * 18. Filtro por userId restringe pointsHistory/topUsersEvolution a 1 usuário
 * 19. Filtro por dateFrom/dateTo muda o tamanho das séries de acordo
 * 20. Filtro por cycleId usa o período exato do ciclo (e 404 se não existir)
 * 21. Filtros não afetam os indicadores do topo (cards "ao vivo")
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3982;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

async function reqJson(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  console.log(`[HTTP] ${method.padEnd(6)} ${path} -> ${res.status}`);
  return { status: res.status, data };
}

async function uploadEvidence(activityId: string, token: string): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'comprovante.jpg');
  await fetch(`${BASE_URL}/activities/${activityId}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, info?: unknown) {
  if (condition) {
    console.log(`   ✅ ${label}`);
    passed++;
  } else {
    console.error(`   ❌ FALHOU: ${label}`, info ?? '');
    failed++;
  }
}

type DashboardBody = {
  data?: {
    indicators?: {
      totalUsers?: number;
      activeUsers?: number;
      activities?: { total?: number; pending?: number; approved?: number; approvedToday?: number };
      pendingRedemptions?: number;
      points?: { totalDistributed?: number; netCirculating?: number };
      topModality?: { name?: string; approvedCount?: number } | null;
      challenges?: { total?: number; active?: number };
      rewardsCatalogCount?: number;
      totalRedemptions?: number;
    };
    topRanking?: Array<{ position: number; points: number }>;
    charts?: {
      activitiesOverTime?: Array<{ date: string; approvedCount: number }>;
      pointsHistory?: {
        day?: Array<{ date: string; label: string; points: number }>;
        month?: Array<{ date: string; label: string; points: number }>;
        year?: Array<{ date: string; label: string; points: number }>;
      };
      usersByDepartment?: Array<{ count: number }>;
      redemptionsByStatus?: Array<{ status: string; count: number }>;
      topActivities?: Array<{ activityTypeId: string; name: string; approvedCount: number }>;
      topUsersEvolution?: {
        day?: Array<{ userId: string; name: string; series?: Array<{ date: string; label: string; points: number }> }>;
        month?: Array<{ userId: string; name: string; series?: Array<{ date: string; label: string; points: number }> }>;
        year?: Array<{ userId: string; name: string; series?: Array<{ date: string; label: string; points: number }> }>;
      };
    };
  };
};

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 20 — PAINEL ADMINISTRATIVO');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Painel Admin rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken);

  // ── PASSO 1-3: Autenticação e autorização ─────────────────────────────────────
  console.log('\n1️⃣ Testando autenticação e autorização...');
  const unauthenticatedRes = await reqJson('GET', '/admin/dashboard');
  assert('Painel sem token retorna 401', unauthenticatedRes.status === 401);

  const participantRes = await reqJson('GET', '/admin/dashboard', undefined, participantToken);
  assert('Participante também acessa o painel geral (200) — visão consolidada aberta a todos', participantRes.status === 200);

  // ── Prepara cenário: atividade pendente + aprovada + resgate ─────────────────
  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  const runningType = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });
  if (!meditationType || !runningType) throw new Error('Modalidades esperadas do seed não encontradas.');

  // Uma atividade fica PENDENTE (não aprovamos)
  await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );

  // Duas atividades de Corrida são aprovadas — deve virar a "modalidade mais praticada"
  for (let i = 0; i < 2; i++) {
    const actRes = await reqJson(
      'POST',
      '/activities',
      { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 3 },
      participantToken,
    );
    type ActivityBody = { data?: { id?: string } };
    const actId = (actRes.data as ActivityBody)?.data?.id ?? '';
    await uploadEvidence(actId, participantToken);
    await reqJson('POST', `/admin/activities/${actId}/approve`, undefined, masterToken);
  }

  // Cria um desafio e um resgate pendente
  const now = new Date();
  await reqJson(
    'POST',
    '/challenges',
    {
      title: 'Desafio do Painel Admin',
      description: 'teste',
      startDate: new Date(now.getTime() - 86400000).toISOString(),
      endDate: new Date(now.getTime() + 86400000).toISOString(),
      targetGoal: 100,
    },
    masterToken,
  );

  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: (participantLogin.data as { data?: { user?: { id?: string } } })?.data?.user?.id, transactionType: 'BONUS', points: 1000, description: 'Bônus para teste do painel.' },
    masterToken,
  );
  const rewardRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Prêmio de Teste do Painel', description: 'teste', pointsCost: 50, quantityAvailable: 10 },
    masterToken,
  );
  type RewardBody = { data?: { id?: string } };
  const rewardId = (rewardRes.data as RewardBody)?.data?.id ?? '';
  await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, participantToken);

  // ── PASSO 3 (continuação): Admin acessa o painel ──────────────────────────────
  console.log('\n2️⃣ Testando acesso e indicadores do painel...');
  const dashboardRes = await reqJson('GET', '/admin/dashboard', undefined, masterToken);
  assert('Admin acessa o painel (200)', dashboardRes.status === 200);
  const dashboard = (dashboardRes.data as DashboardBody)?.data;

  // ── PASSO 4: Usuários ──────────────────────────────────────────────────────────
  const realTotalUsers = await prisma.user.count();
  const realActiveUsers = await prisma.user.count({ where: { status: 'ACTIVE' } });
  assert(`indicators.totalUsers bate com o banco (${realTotalUsers})`, dashboard?.indicators?.totalUsers === realTotalUsers);
  assert(`indicators.activeUsers bate com o banco (${realActiveUsers})`, dashboard?.indicators?.activeUsers === realActiveUsers);

  // ── PASSO 5: Atividades ────────────────────────────────────────────────────────
  console.log('\n3️⃣ Testando indicadores de atividades...');
  const realPending = await prisma.userActivity.count({ where: { status: 'PENDING' } });
  const realApproved = await prisma.userActivity.count({ where: { status: 'APPROVED' } });
  assert(`indicators.activities.pending bate com o banco (${realPending})`, dashboard?.indicators?.activities?.pending === realPending);
  assert(`indicators.activities.approved bate com o banco (${realApproved})`, dashboard?.indicators?.activities?.approved === realApproved);
  assert('indicators.activities.approvedToday reflete as 2 aprovações de hoje (>= 2)', (dashboard?.indicators?.activities?.approvedToday ?? 0) >= 2);

  // ── PASSO 6: Resgates pendentes ────────────────────────────────────────────────
  const realPendingRedemptions = await prisma.userReward.count({ where: { status: 'REQUESTED' } });
  assert(`indicators.pendingRedemptions bate com o banco (${realPendingRedemptions})`, dashboard?.indicators?.pendingRedemptions === realPendingRedemptions);

  // ── PASSO 7: Pontos líquidos ───────────────────────────────────────────────────
  console.log('\n4️⃣ Testando consistência de pontos distribuídos...');
  const sumOfTotalPoints = (await prisma.user.aggregate({ _sum: { totalPoints: true } }))._sum.totalPoints ?? 0;
  assert(
    `points.netCirculating bate com a soma de totalPoints de todos os usuários (${sumOfTotalPoints})`,
    dashboard?.indicators?.points?.netCirculating === sumOfTotalPoints,
  );

  // ── PASSO 8: Modalidade mais praticada ────────────────────────────────────────
  console.log('\n5️⃣ Testando modalidade mais praticada...');
  assert('topModality aponta Corrida (2 aprovações)', dashboard?.indicators?.topModality?.name?.includes('Corrida') ?? false);
  assert('topModality.approvedCount >= 2', (dashboard?.indicators?.topModality?.approvedCount ?? 0) >= 2);

  // ── PASSO 9-10: Desafios e premiações ─────────────────────────────────────────
  console.log('\n6️⃣ Testando indicadores de desafios e premiações...');
  assert('indicators.challenges.total >= 1', (dashboard?.indicators?.challenges?.total ?? 0) >= 1);
  assert('indicators.rewardsCatalogCount >= 1', (dashboard?.indicators?.rewardsCatalogCount ?? 0) >= 1);
  assert('indicators.totalRedemptions >= 1', (dashboard?.indicators?.totalRedemptions ?? 0) >= 1);

  // ── PASSO 11: Top ranking ──────────────────────────────────────────────────────
  console.log('\n7️⃣ Testando topRanking...');
  const topRanking = dashboard?.topRanking ?? [];
  assert('topRanking tem no máximo 5 posições', topRanking.length <= 5);
  const isSorted = topRanking.every((e, i) => i === 0 || topRanking[i - 1].points >= e.points);
  assert('topRanking está ordenado por pontos (desc)', isSorted);

  // ── PASSO 12-13: Gráficos de tendência ────────────────────────────────────────
  console.log('\n8️⃣ Testando gráficos de tendência...');
  const activitiesOverTime = dashboard?.charts?.activitiesOverTime ?? [];
  assert('activitiesOverTime tem 30 dias', activitiesOverTime.length === 30);
  const todayApprovedCount = activitiesOverTime[activitiesOverTime.length - 1]?.approvedCount ?? 0;
  assert(`Dia de hoje reflete as aprovações recentes (${todayApprovedCount} >= 2)`, todayApprovedCount >= 2);

  const pointsHistory = dashboard?.charts?.pointsHistory;
  const pointsHistoryDay = pointsHistory?.day ?? [];
  const pointsHistoryMonth = pointsHistory?.month ?? [];
  const pointsHistoryYear = pointsHistory?.year ?? [];
  assert('pointsHistory.day tem 30 dias', pointsHistoryDay.length === 30);
  assert('pointsHistory.month tem 12 meses', pointsHistoryMonth.length === 12);
  assert('pointsHistory.year tem 3 anos', pointsHistoryYear.length === 3);
  assert(
    'Todos os valores são >= 0 (só transações positivas)',
    [...pointsHistoryDay, ...pointsHistoryMonth, ...pointsHistoryYear].every((d) => d.points >= 0),
  );

  // ── PASSO 14: Usuários por departamento ────────────────────────────────────────
  console.log('\n9️⃣ Testando usuários por departamento...');
  const usersByDepartment = dashboard?.charts?.usersByDepartment ?? [];
  const sumByDepartment = usersByDepartment.reduce((acc, d) => acc + d.count, 0);
  const usersWithDepartment = await prisma.user.count({ where: { departmentId: { not: null } } });
  assert(
    `Soma de usersByDepartment bate com usuários vinculados a departamento (${usersWithDepartment})`,
    sumByDepartment === usersWithDepartment,
  );

  // ── PASSO 15: Resgates por status ──────────────────────────────────────────────
  console.log('\n🔟 Testando resgates por status...');
  const redemptionsByStatus = dashboard?.charts?.redemptionsByStatus ?? [];
  const requestedEntry = redemptionsByStatus.find((r) => r.status === 'REQUESTED');
  assert('redemptionsByStatus reflete o resgate REQUESTED criado', (requestedEntry?.count ?? 0) >= 1);

  // ── PASSO 16: Top 5 atividades mais realizadas ────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando charts.topActivities (top 5 atividades)...');
  const topActivities = dashboard?.charts?.topActivities ?? [];
  assert('topActivities tem no máximo 5 modalidades', topActivities.length <= 5);
  const topActivitiesSorted = topActivities.every((a, i) => i === 0 || topActivities[i - 1].approvedCount >= a.approvedCount);
  assert('topActivities está ordenado por quantidade (desc)', topActivitiesSorted);
  assert('topActivities aponta Corrida em 1º (mesma modalidade do topModality)', topActivities[0]?.name?.includes('Corrida') ?? false);

  // ── PASSO 17: Evolução dos usuários (top 5, multi-linha) ──────────────────────
  console.log('\n1️⃣2️⃣ Testando charts.topUsersEvolution (evolução dos usuários)...');
  const topUsersEvolution = dashboard?.charts?.topUsersEvolution;
  const tueDay = topUsersEvolution?.day ?? [];
  const tueMonth = topUsersEvolution?.month ?? [];
  const tueYear = topUsersEvolution?.year ?? [];
  assert('topUsersEvolution.day tem no máximo 5 usuários', tueDay.length <= 5 && tueDay.length > 0);
  assert('topUsersEvolution.month tem no máximo 5 usuários', tueMonth.length <= 5 && tueMonth.length > 0);
  assert('topUsersEvolution.year tem no máximo 5 usuários', tueYear.length <= 5 && tueYear.length > 0);
  assert('Série "day" de cada usuário tem 30 pontos (mesmo tamanho do pointsHistory.day)', tueDay.every((u) => (u.series?.length ?? 0) === 30));
  assert('Série "month" de cada usuário tem 12 pontos', tueMonth.every((u) => (u.series?.length ?? 0) === 12));
  assert('Série "year" de cada usuário tem 3 pontos', tueYear.every((u) => (u.series?.length ?? 0) === 3));
  const lastDayPointsByUser = new Map(tueDay.map((u) => [u.userId, u.series?.[u.series.length - 1]?.points ?? -1]));
  const realUserTotals = await prisma.user.findMany({ where: { id: { in: tueDay.map((u) => u.userId) } }, select: { id: true, totalPoints: true } });
  const evolutionMatchesRealTotal = realUserTotals.every((u) => lastDayPointsByUser.get(u.id) === u.totalPoints);
  assert('Último ponto da série "day" bate com o total atual de pontos do usuário', evolutionMatchesRealTotal);

  // ── PASSO 18: Filtro por userId ────────────────────────────────────────────────
  console.log('\n1️⃣3️⃣ Testando filtro por userId...');
  const participantId = (participantLogin.data as { data?: { user?: { id?: string } } })?.data?.user?.id ?? '';
  const byUserRes = await reqJson('GET', `/admin/dashboard?userId=${participantId}`, undefined, masterToken);
  assert('Painel com filtro userId retorna 200', byUserRes.status === 200);
  const byUserDashboard = (byUserRes.data as DashboardBody)?.data;
  const byUserTue = byUserDashboard?.charts?.topUsersEvolution?.day ?? [];
  assert('Filtro por userId restringe topUsersEvolution.day a 1 usuário', byUserTue.length === 1 && byUserTue[0]?.userId === participantId);
  const byUserPointsTotal = (byUserDashboard?.charts?.pointsHistory?.day ?? []).reduce((sum, d) => sum + d.points, 0);
  const realParticipantPositiveSum =
    (await prisma.pointsTransaction.aggregate({ where: { userId: participantId, points: { gt: 0 } }, _sum: { points: true } }))._sum.points ?? 0;
  assert(
    `Filtro por userId restringe pointsHistory.day à soma de pontos do participante (${realParticipantPositiveSum})`,
    byUserPointsTotal === realParticipantPositiveSum,
  );

  // ── PASSO 19: Filtro por dateFrom/dateTo ───────────────────────────────────────
  console.log('\n1️⃣4️⃣ Testando filtro por data (dateFrom/dateTo)...');
  const fiveDaysAgo = new Date(now.getTime() - 4 * 86400000);
  const byDateRes = await reqJson(
    'GET',
    `/admin/dashboard?dateFrom=${fiveDaysAgo.toISOString()}&dateTo=${now.toISOString()}`,
    undefined,
    masterToken,
  );
  assert('Painel com filtro de data retorna 200', byDateRes.status === 200);
  const byDateDashboard = (byDateRes.data as DashboardBody)?.data;
  assert('Filtro de 5 dias gera pointsHistory.day com 5 pontos', (byDateDashboard?.charts?.pointsHistory?.day ?? []).length === 5);
  assert('Filtro de 5 dias gera pointsHistory.month com 1 ponto (mesmo mês)', (byDateDashboard?.charts?.pointsHistory?.month ?? []).length >= 1);

  // ── PASSO 20: Filtro por cycleId ────────────────────────────────────────────────
  console.log('\n1️⃣5️⃣ Testando filtro por cycleId...');
  const cycleStart = new Date(now.getTime() - 2 * 86400000);
  const cycleEnd = new Date(now.getTime() + 5 * 86400000);
  const cycleRes = await reqJson('POST', '/cycles', { name: 'Ciclo de Teste do Painel', startDate: cycleStart.toISOString(), endDate: cycleEnd.toISOString(), prizes: [] }, masterToken);
  type CycleBody = { data?: { id?: string } };
  const cycleId = (cycleRes.data as CycleBody)?.data?.id ?? '';
  const byCycleRes = await reqJson('GET', `/admin/dashboard?cycleId=${cycleId}`, undefined, masterToken);
  assert('Painel com filtro cycleId retorna 200', byCycleRes.status === 200);
  const byCycleDashboard = (byCycleRes.data as DashboardBody)?.data;
  const expectedCycleDays = Math.floor((cycleEnd.getTime() - cycleStart.getTime()) / 86400000) + 1;
  assert(
    `Filtro por ciclo cobre exatamente o período do ciclo (${expectedCycleDays} dias)`,
    (byCycleDashboard?.charts?.pointsHistory?.day ?? []).length === expectedCycleDays,
  );

  const invalidCycleRes = await reqJson('GET', '/admin/dashboard?cycleId=00000000-0000-0000-0000-000000000000', undefined, masterToken);
  assert('Filtro com cycleId inexistente retorna 404', invalidCycleRes.status === 404);

  // Cancela o ciclo criado só pra este teste — do contrário ele fica ACTIVE
  // no banco e passa a colidir (sobreposição de datas) com os ciclos que
  // outras suítes (ex.: test:cycles) criam depois, numa mesma execução
  // sequencial sem reset de banco entre arquivos.
  await reqJson('POST', `/cycles/${cycleId}/cancel`, undefined, masterToken);

  // ── PASSO 21: Filtros não afetam os indicadores do topo ────────────────────────
  console.log('\n1️⃣6️⃣ Testando que filtros não afetam os indicadores (cards "ao vivo")...');
  assert(
    'indicators.totalUsers é igual com e sem filtro (cards não são filtrados)',
    byUserDashboard?.indicators?.totalUsers === dashboard?.indicators?.totalUsers,
  );
  assert(
    'indicators.points.netCirculating é igual com e sem filtro',
    byUserDashboard?.indicators?.points?.netCirculating === dashboard?.indicators?.points?.netCirculating,
  );
  assert(
    'indicators.activities.approvedToday é igual com e sem filtro',
    byUserDashboard?.indicators?.activities?.approvedToday === dashboard?.indicators?.activities?.approvedToday,
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 20 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 20:', err);
  process.exit(1);
});
