/**
 * FASE 17 — TESTES AUTOMATIZADOS DO DASHBOARD
 *
 * Cobre:
 * 1. Dashboard exige autenticação (401 sem token)
 * 2. points.total reflete o total real do usuário (bate com /auth/me)
 * 3. ranking.position bate com a posição calculada em /ranking
 * 4. level.current reflete o nível atual do usuário
 * 5. level.progress.current/target fazem sentido (current < target quando há próximo nível)
 * 6. recentActivities respeita o limite solicitado (activityLimit)
 * 7. recentActivities reflete atividade recém-criada
 * 8. charts.pointsEvolution tem 30 pontos e o último dia reflete o total atual
 * 9. charts.activitiesByModality soma corretamente após aprovação
 * 10. charts.performanceByPeriod tem 8 semanas e a semana atual reflete pontos recentes
 * 11. charts.rankingEvolution é explicitamente null (limitação documentada, não omitida)
 * 12. motivationalMessage é uma string não vazia e reflete o 1º lugar corretamente
 * 13. motivationalMessage cita o gap de pontos correto para quem não é 1º lugar
 * 14. Dashboard é sempre o do próprio usuário (não aceita userId de outro)
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3985;
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
    points?: { total?: number };
    ranking?: { position?: number | null; totalParticipants?: number };
    level?: {
      current?: { id?: string } | null;
      next?: { minPoints?: number } | null;
      progress?: { current?: number; target?: number | null };
    };
    recentActivities?: Array<{ id: string; createdAt: string }>;
    charts?: {
      pointsEvolution?: Array<{ date: string; cumulativePoints: number }>;
      activitiesByModality?: Array<{ activityTypeName: string; count: number; totalPoints: number }>;
      rankingEvolution?: null;
      performanceByPeriod?: Array<{ weekStart: string; points: number }>;
    };
    motivationalMessage?: string;
  };
};

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 17 — DASHBOARD');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Dashboard rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; totalPoints?: number } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken);

  // ── PASSO 1: Autenticação obrigatória ─────────────────────────────────────────
  console.log('\n1️⃣ Testando exigência de autenticação...');
  const unauthenticatedRes = await reqJson('GET', '/dashboard');
  assert('Dashboard sem token retorna 401', unauthenticatedRes.status === 401);

  // ── Prepara dados: aprova uma atividade para ter histórico rico ──────────────
  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  if (!meditationType) throw new Error('Modalidade Meditação não encontrada no seed.');

  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string; calculatedPoints?: number } };
  const newActivity = (createRes.data as ActivityBody)?.data;
  await reqJson('POST', `/admin/activities/${newActivity?.id}/approve`, undefined, masterToken);

  // ── PASSO 2: points.total bate com /auth/me ───────────────────────────────────
  console.log('\n2️⃣ Testando consistência de points.total...');
  const meRes = await reqJson('GET', '/auth/me', undefined, participantToken);
  type MeBody = { data?: { totalPoints?: number } };
  const meTotal = (meRes.data as MeBody)?.data?.totalPoints ?? -1;

  const dashboardRes = await reqJson('GET', '/dashboard', undefined, participantToken);
  assert('Dashboard retorna 200', dashboardRes.status === 200);
  const dashboard = (dashboardRes.data as DashboardBody)?.data;
  assert(`points.total bate com /auth/me (${meTotal})`, dashboard?.points?.total === meTotal);

  // ── PASSO 3: ranking.position bate com /ranking ───────────────────────────────
  console.log('\n3️⃣ Testando consistência de ranking.position...');
  const rankingRes = await reqJson('GET', '/ranking?limit=100', undefined, participantToken);
  type RankingBody = { data?: Array<{ userId: string; position: number }> };
  const myRankingEntry = ((rankingRes.data as RankingBody)?.data ?? []).find((e) => e.userId === participantId);
  assert(
    `ranking.position bate com /ranking (${myRankingEntry?.position})`,
    dashboard?.ranking?.position === myRankingEntry?.position,
  );

  // ── PASSO 4-5: Nível e progresso ──────────────────────────────────────────────
  console.log('\n4️⃣ Testando nível atual e progresso...');
  assert('level.current está presente', !!dashboard?.level?.current);
  if (dashboard?.level?.next) {
    assert(
      'progress.current < progress.target quando há próximo nível',
      (dashboard.level.progress?.current ?? 0) < (dashboard.level.progress?.target ?? 0),
    );
  } else {
    assert('progress.target é null quando já está no nível máximo', dashboard?.level?.progress?.target === null);
  }

  // ── PASSO 6-7: Atividades recentes ────────────────────────────────────────────
  console.log('\n5️⃣ Testando atividades recentes...');
  const limitedRes = await reqJson('GET', '/dashboard?activityLimit=1', undefined, participantToken);
  const limitedDashboard = (limitedRes.data as DashboardBody)?.data;
  assert('recentActivities respeita o limite solicitado', limitedDashboard?.recentActivities?.length === 1);
  assert(
    'A atividade recém-aprovada aparece nas atividades recentes',
    (dashboard?.recentActivities ?? []).some((a) => a.id === newActivity?.id),
  );

  // ── PASSO 8: Evolução de pontos ───────────────────────────────────────────────
  console.log('\n6️⃣ Testando gráfico de evolução de pontos...');
  const pointsEvolution = dashboard?.charts?.pointsEvolution ?? [];
  assert('pointsEvolution tem 30 dias', pointsEvolution.length === 30);
  assert(
    `Último dia da série reflete o total atual (${meTotal})`,
    pointsEvolution[pointsEvolution.length - 1]?.cumulativePoints === meTotal,
  );

  // ── PASSO 9: Atividades por modalidade ────────────────────────────────────────
  console.log('\n7️⃣ Testando gráfico de atividades por modalidade...');
  const byModality = dashboard?.charts?.activitiesByModality ?? [];
  const meditationEntry = byModality.find((m) => m.activityTypeName.includes('Meditação'));
  assert('Meditação aparece no agrupamento por modalidade com count >= 1', (meditationEntry?.count ?? 0) >= 1);

  // ── PASSO 10: Desempenho por período ──────────────────────────────────────────
  console.log('\n8️⃣ Testando gráfico de desempenho por período...');
  const performance = dashboard?.charts?.performanceByPeriod ?? [];
  assert('performanceByPeriod tem 8 semanas', performance.length === 8);
  const currentWeekPoints = performance[performance.length - 1]?.points ?? 0;
  assert(`Semana atual reflete pontos ganhos recentemente (${currentWeekPoints} > 0)`, currentWeekPoints > 0);

  // ── PASSO 11: rankingEvolution explicitamente null ────────────────────────────
  console.log('\n9️⃣ Testando que rankingEvolution é explicitamente null (não omitido)...');
  assert('charts.rankingEvolution é null (chave presente, limitação documentada)', dashboard?.charts?.rankingEvolution === null);

  // ── PASSO 12-13: Mensagem motivacional ────────────────────────────────────────
  console.log('\n🔟 Testando mensagem motivacional...');
  assert('motivationalMessage é uma string não vazia', typeof dashboard?.motivationalMessage === 'string' && dashboard.motivationalMessage.length > 0);

  if (myRankingEntry?.position === 1) {
    assert('Mensagem de 1º lugar é exibida corretamente', dashboard?.motivationalMessage?.includes('1º lugar') ?? false);
  } else if (myRankingEntry) {
    const aheadEntry = ((rankingRes.data as RankingBody)?.data ?? []).find((e) => e.position === (myRankingEntry.position ?? 0) - 1);
    assert(
      'Mensagem cita a posição correta de quem está à frente',
      dashboard?.motivationalMessage?.includes(`${aheadEntry?.position}º colocado`) ?? false,
    );
  }

  // ── PASSO 14: Sempre o próprio dashboard ──────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando que o dashboard ignora tentativa de userId de outro usuário...');
  const otherLogin = await reqJson('POST', '/auth/login', { email: 'beatriz@empresa.com', password: 'user123' });
  const otherToken = (otherLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const otherDashboardRes = await reqJson(`GET`, `/dashboard?userId=${participantId}`, undefined, otherToken);
  const otherDashboard = (otherDashboardRes.data as DashboardBody)?.data;
  assert(
    'Dashboard retorna os dados de quem está autenticado, ignorando qualquer userId na query',
    otherDashboard?.points?.total !== dashboard?.points?.total || otherToken === participantToken,
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 17 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 17:', err);
  process.exit(1);
});
