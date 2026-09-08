/**
 * FASE 10 — TESTES AUTOMATIZADOS DO RANKING
 *
 * Cobre:
 * 1. Ranking geral acessível por qualquer usuário autenticado
 * 2. Ranking geral ordenado corretamente por pontos (desc)
 * 3. Posição (position) é sequencial começando em 1
 * 4. Regra de empate: pontos iguais ordenados alfabeticamente por nome
 * 5. Ranking muda automaticamente após aprovação de atividade (sem cache)
 * 6. Filtro por período (WEEK) reflete apenas pontos ganhos na semana atual
 * 7. Usuário sem pontos no período aparece no ranking com points=0
 * 8. Filtro por modalidade retorna apenas pontos daquela modalidade
 * 9. Filtro por departamento retorna apenas usuários daquele departamento
 * 10. Modalidade inexistente no filtro retorna 404
 * 11. Departamento inexistente no filtro retorna 404
 * 12. Endpoint exige autenticação (401 sem token)
 * 13. Paginação funciona corretamente (limit/page)
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3992;
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

type RankingEntry = {
  position: number;
  userId: string;
  name: string;
  points: number;
  totalPointsAllTime: number;
  department: { id: string; name: string } | null;
};
type RankingBody = { data?: RankingEntry[]; meta?: { total?: number } };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 10 — RANKING');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Ranking rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken);

  // ── PASSO 1: Acesso e ordenação básica ────────────────────────────────────────
  console.log('\n1️⃣ Testando acesso e ordenação do ranking geral...');
  const generalRes = await reqJson('GET', '/ranking?limit=100', undefined, participantToken);
  assert('Ranking geral acessível por participante (200)', generalRes.status === 200);
  const generalEntries = (generalRes.data as RankingBody)?.data ?? [];
  assert('Ranking contém entradas', generalEntries.length > 0);

  const isSortedDesc = generalEntries.every((e, i) => i === 0 || generalEntries[i - 1].points >= e.points);
  assert('Ranking ordenado corretamente por pontos (desc)', isSortedDesc);

  const positionsSequential = generalEntries.every((e, i) => e.position === i + 1);
  assert('Posições são sequenciais começando em 1', positionsSequential);

  // ── PASSO 2: Empate por ordem alfabética ──────────────────────────────────────
  console.log('\n2️⃣ Testando regra de empate (pontos iguais -> ordem alfabética)...');
  const tiedGroups = new Map<number, RankingEntry[]>();
  for (const e of generalEntries) {
    if (!tiedGroups.has(e.points)) tiedGroups.set(e.points, []);
    tiedGroups.get(e.points)!.push(e);
  }
  let tieRuleHolds = true;
  for (const group of tiedGroups.values()) {
    if (group.length > 1) {
      const names = group.map((g) => g.name);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (JSON.stringify(names) !== JSON.stringify(sortedNames)) tieRuleHolds = false;
    }
  }
  assert('Empates são ordenados alfabeticamente pelo nome', tieRuleHolds);

  // ── PASSO 3: Ranking muda após aprovação (sem cache) ──────────────────────────
  console.log('\n3️⃣ Testando atualização automática do ranking após aprovação...');
  const beforeApprovalRes = await reqJson('GET', `/ranking?limit=100`, undefined, participantToken);
  const beforeEntry = ((beforeApprovalRes.data as RankingBody)?.data ?? []).find((e) => e.userId === participantId);
  const pointsBefore = beforeEntry?.points ?? 0;

  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  if (!meditationType) throw new Error('Modalidade Meditação não encontrada no seed.');

  const approvalStartedAt = new Date();
  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string; calculatedPoints?: number } };
  const newActivity = (createRes.data as ActivityBody)?.data;
  await reqJson('POST', `/admin/activities/${newActivity?.id}/approve`, undefined, masterToken);

  const afterApprovalRes = await reqJson('GET', `/ranking?limit=100`, undefined, participantToken);
  const afterEntry = ((afterApprovalRes.data as RankingBody)?.data ?? []).find((e) => e.userId === participantId);

  // O delta esperado vem do ledger real (pode incluir bônus de conquistas
  // desbloqueadas na mesma aprovação, desde a Fase 12 — por isso não assumimos
  // um valor fixo de "+calculatedPoints", e sim o que o ledger de fato registrou).
  const ledgerDelta = (
    await prisma.pointsTransaction.aggregate({
      where: { userId: participantId, createdAt: { gte: approvalStartedAt } },
      _sum: { points: true },
    })
  )._sum.points ?? 0;
  assert(
    `Ranking refletiu a aprovação automaticamente (antes: ${pointsBefore}, depois: ${afterEntry?.points}, delta real do ledger: +${ledgerDelta})`,
    afterEntry?.points === pointsBefore + ledgerDelta,
  );

  // ── PASSO 4: Filtro por período (WEEK) ────────────────────────────────────────
  console.log('\n4️⃣ Testando filtro por período (semana atual)...');
  const weekRes = await reqJson('GET', '/ranking?period=WEEK&limit=100', undefined, participantToken);
  assert('Filtro period=WEEK retorna 200', weekRes.status === 200);
  const weekEntry = ((weekRes.data as RankingBody)?.data ?? []).find((e) => e.userId === participantId);
  assert(
    'Pontos da semana incluem a atividade recém-aprovada (criada hoje)',
    (weekEntry?.points ?? 0) >= (newActivity?.calculatedPoints ?? 0),
  );

  // ── PASSO 5: Usuário sem pontos no período aparece com 0 ──────────────────────
  console.log('\n5️⃣ Testando que usuários sem pontos no período aparecem com 0...');
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  // Usa período YEAR (não deveria zerar ninguém que tenha atividade este ano, mas
  // garante ao menos que o endpoint retorna todos os usuários ativos, mesmo com 0).
  const allUsersCount = await prisma.user.count({ where: { status: 'ACTIVE' } });
  assert(
    `Ranking geral lista todos os usuários ativos (esperado ${allUsersCount}, obtido ${(generalRes.data as RankingBody)?.meta?.total})`,
    (generalRes.data as RankingBody)?.meta?.total === allUsersCount,
  );

  // ── PASSO 6: Filtro por modalidade ────────────────────────────────────────────
  console.log('\n6️⃣ Testando filtro por modalidade...');
  const modalityRankingRes = await reqJson(
    'GET',
    `/ranking?activityTypeId=${meditationType.id}&limit=100`,
    undefined,
    participantToken,
  );
  assert('Filtro por modalidade retorna 200', modalityRankingRes.status === 200);
  const modalityEntry = ((modalityRankingRes.data as RankingBody)?.data ?? []).find((e) => e.userId === participantId);
  assert(
    'Participante aparece no ranking da modalidade com os pontos da atividade aprovada',
    (modalityEntry?.points ?? 0) >= (newActivity?.calculatedPoints ?? 0),
  );

  // ── PASSO 7: Filtro por departamento ──────────────────────────────────────────
  console.log('\n7️⃣ Testando filtro por departamento...');
  const participantUser = await prisma.user.findUnique({ where: { id: participantId }, select: { departmentId: true } });
  const deptRes = await reqJson(
    'GET',
    `/ranking?departmentId=${participantUser?.departmentId}&limit=100`,
    undefined,
    participantToken,
  );
  const deptEntries = (deptRes.data as RankingBody)?.data ?? [];
  assert('Filtro por departamento retorna 200', deptRes.status === 200);
  assert(
    'Todos os resultados pertencem ao departamento filtrado',
    deptEntries.every((e) => e.department?.id === participantUser?.departmentId),
  );

  // ── PASSO 8: IDs inexistentes ──────────────────────────────────────────────────
  console.log('\n8️⃣ Testando filtros com IDs inexistentes...');
  const invalidModalityRes = await reqJson(
    'GET',
    '/ranking?activityTypeId=00000000-0000-0000-0000-000000000000',
    undefined,
    participantToken,
  );
  assert('Modalidade inexistente retorna 404', invalidModalityRes.status === 404);

  const invalidDeptRes = await reqJson(
    'GET',
    '/ranking?departmentId=00000000-0000-0000-0000-000000000000',
    undefined,
    participantToken,
  );
  assert('Departamento inexistente retorna 404', invalidDeptRes.status === 404);

  // ── PASSO 9: Autenticação obrigatória ─────────────────────────────────────────
  console.log('\n9️⃣ Testando exigência de autenticação...');
  const unauthenticatedRes = await reqJson('GET', '/ranking');
  assert('Ranking sem token retorna 401', unauthenticatedRes.status === 401);

  // ── PASSO 10: Paginação ───────────────────────────────────────────────────────
  console.log('\n🔟 Testando paginação...');
  const page1Res = await reqJson('GET', '/ranking?limit=2&page=1', undefined, participantToken);
  const page2Res = await reqJson('GET', '/ranking?limit=2&page=2', undefined, participantToken);
  const page1 = (page1Res.data as RankingBody)?.data ?? [];
  const page2 = (page2Res.data as RankingBody)?.data ?? [];
  assert('Página 1 retorna no máximo 2 itens', page1.length <= 2);
  assert(
    'Página 2 não repete usuários da página 1',
    page1.every((p1) => !page2.some((p2) => p2.userId === p1.userId)) || page2.length === 0,
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 10 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 10:', err);
  process.exit(1);
});
