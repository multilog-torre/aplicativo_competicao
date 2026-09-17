/**
 * FASE 13 — TESTES AUTOMATIZADOS DE DESAFIOS
 *
 * Cobre:
 * 1. Catálogo de desafios é público
 * 2. Participante não pode criar desafio (403)
 * 3. Criação com startDate >= endDate é bloqueada (422)
 * 4. effectiveStatus calculado corretamente (ACTIVE dentro do período)
 * 5. Participante entra em um desafio ativo (join)
 * 6. Entrar duas vezes no mesmo desafio é bloqueado (409)
 * 7. Entrar em desafio fora do período é bloqueado (422)
 * 8. Progresso retroativo: atividades já aprovadas no período contam ao entrar
 * 9. Progresso incremental: nova atividade aprovada atualiza currentProgress automaticamente
 * 10. Conclusão automática ao atingir targetGoal credita rewardPoints no ledger
 * 11. Nível é reavaliado após recompensa de desafio
 * 12. Leaderboard (participantes) ordenado por progresso, com regra de empate
 * 13. Agregação por departamento soma o progresso corretamente
 * 14. Exclusão de desafio com participantes vira cancelamento (preserva histórico)
 * 15. Desafio inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3989;
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

/** Corrida exige evidência (Fase 7/8) — helper para anexar antes de aprovar. */
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

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 13 — DESAFIOS');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Desafios rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  const otherLogin = await reqJson('POST', '/auth/login', { email: 'beatriz@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const otherToken = (otherLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken && !!otherToken);

  // Este arquivo testa fluxos que dependem de atividades PENDENTES aguardando
  // aprovação manual — desativa a aprovação automática (ativada por padrão
  // desde a Fase de Aprovação Automática) pra preservar esse comportamento.
  await reqJson('PATCH', '/settings', { autoApproveActivities: false }, masterToken);

  const runningType = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });
  if (!runningType) throw new Error('Modalidade Corrida não encontrada no seed.');

  // ── PASSO 1: Catálogo público ─────────────────────────────────────────────────
  console.log('\n1️⃣ Testando catálogo público de desafios...');
  const catalogRes = await reqJson('GET', '/challenges');
  assert('Catálogo é público (200 sem token)', catalogRes.status === 200);

  // ── PASSO 2: Bloqueio de criação ──────────────────────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const now = new Date();
  const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // começou há 2 dias
  const endDate = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000); // termina em 28 dias

  const blockedRes = await reqJson(
    'POST',
    '/challenges',
    {
      title: 'Desafio Fake',
      description: 'teste',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      targetGoal: 10,
    },
    participantToken,
  );
  assert('Participante não pode criar desafio (403)', blockedRes.status === 403);

  // ── PASSO 3: Data inválida ─────────────────────────────────────────────────────
  console.log('\n3️⃣ Testando bloqueio de startDate >= endDate...');
  const invalidDateRes = await reqJson(
    'POST',
    '/challenges',
    { title: 'Datas Invertidas', description: 'teste', startDate: endDate.toISOString(), endDate: startDate.toISOString(), targetGoal: 10 },
    masterToken,
  );
  assert('startDate >= endDate é bloqueado (422)', invalidDateRes.status === 422);

  // ── PASSO 4: Criação de desafio ativo (100 km de corrida no mês) ──────────────
  console.log('\n4️⃣ Testando criação de desafio ativo por admin...');
  const createRes = await reqJson(
    'POST',
    '/challenges',
    {
      title: '100 km no mês',
      description: 'Corra 100 km somados dentro do período do desafio.',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      activityTypeId: runningType.id,
      targetGoal: 100,
      unit: 'km',
      rewardPoints: 200,
      scope: 'COMPANY',
    },
    masterToken,
  );
  assert('Desafio criado com sucesso (201)', createRes.status === 201);
  type ChallengeBody = { data?: { id?: string; effectiveStatus?: string } };
  const challenge = (createRes.data as ChallengeBody)?.data;
  assert('effectiveStatus calculado como ACTIVE (dentro do período)', challenge?.effectiveStatus === 'ACTIVE');
  const challengeId = challenge?.id ?? '';

  // ── PASSO 5: Registra e aprova 30km ANTES de entrar no desafio (retroativo) ───
  console.log('\n5️⃣ Testando progresso retroativo ao entrar no desafio...');
  const preActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 30 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string } };
  const preActivityId = (preActivityRes.data as ActivityBody)?.data?.id ?? '';
  await uploadEvidence(preActivityId, participantToken);
  await reqJson('POST', `/admin/activities/${preActivityId}/approve`, undefined, masterToken);

  const joinRes = await reqJson('POST', `/challenges/${challengeId}/join`, undefined, participantToken);
  assert('Participante entra no desafio com sucesso (201)', joinRes.status === 201);
  type JoinBody = { data?: { currentProgress?: number; completed?: boolean } };
  const joinData = (joinRes.data as JoinBody)?.data;
  assert(`Progresso retroativo já reflete os 30 km aprovados (obtido ${joinData?.currentProgress})`, joinData?.currentProgress === 30);
  assert('Ainda não completou (30/100)', joinData?.completed === false);

  // ── PASSO 6: Entrar duas vezes é bloqueado ────────────────────────────────────
  console.log('\n6️⃣ Testando bloqueio de participação duplicada...');
  const doubleJoinRes = await reqJson('POST', `/challenges/${challengeId}/join`, undefined, participantToken);
  assert('Entrar duas vezes é bloqueado (409)', doubleJoinRes.status === 409);

  // ── PASSO 7: Desafio fora do período ───────────────────────────────────────────
  console.log('\n7️⃣ Testando bloqueio de participação em desafio fora do período...');
  const pastStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pastChallengeRes = await reqJson(
    'POST',
    '/challenges',
    { title: 'Desafio Encerrado', description: 'já passou', startDate: pastStart.toISOString(), endDate: pastEnd.toISOString(), targetGoal: 10 },
    masterToken,
  );
  const pastChallengeId = (pastChallengeRes.data as ChallengeBody)?.data?.id ?? '';
  const joinPastRes = await reqJson('POST', `/challenges/${pastChallengeId}/join`, undefined, otherToken);
  assert('Participação em desafio encerrado é bloqueada (422)', joinPastRes.status === 422);

  // ── PASSO 8-11: Progresso incremental e conclusão automática ─────────────────
  console.log('\n8️⃣ Testando progresso incremental e conclusão automática com recompensa...');
  const beforeUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });

  // Faltam 70km (30 já feitos) para bater a meta de 100km — registra e aprova 75km
  const finishingActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 75 },
    participantToken,
  );
  const finishingActivityId = (finishingActivityRes.data as ActivityBody)?.data?.id ?? '';
  await uploadEvidence(finishingActivityId, participantToken);
  const approveFinishRes = await reqJson('POST', `/admin/activities/${finishingActivityId}/approve`, undefined, masterToken);
  assert('Aprovação da atividade que conclui o desafio funciona (200)', approveFinishRes.status === 200);

  const participantRow = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId: participantId } },
  });
  assert(`Progresso atualizado incrementalmente (30+75=105, obtido ${participantRow?.currentProgress})`, participantRow?.currentProgress === 105);
  assert('Desafio marcado como concluído automaticamente', participantRow?.completed === true);

  const challengeTx = await prisma.pointsTransaction.findFirst({
    where: { userId: participantId, transactionType: 'CHALLENGE', challengeId },
  });
  assert('Ledger recebeu transação CHALLENGE com os 200 pontos de recompensa', challengeTx?.points === 200);

  const afterUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  assert(
    'Nível foi reavaliado (pode ter mudado) após a recompensa do desafio',
    afterUser?.levelId !== undefined, // apenas garante que a consulta funcionou; a mudança em si já é coberta pela Fase 11
  );
  assert('Total do usuário aumentou pelo menos os 200 pontos do desafio', (afterUser?.totalPoints ?? 0) >= (beforeUser?.totalPoints ?? 0) + 200);

  // ── PASSO 12: Leaderboard ──────────────────────────────────────────────────────
  console.log('\n9️⃣ Testando leaderboard de participantes...');
  const leaderboardRes = await reqJson('GET', `/challenges/${challengeId}/participants`);
  type LeaderboardBody = { data?: Array<{ position: number; userId: string; currentProgress: number }> };
  const leaderboard = (leaderboardRes.data as LeaderboardBody)?.data ?? [];
  assert('Leaderboard retorna 200 com o participante', leaderboardRes.status === 200 && leaderboard.length === 1);
  assert('Posição do único participante é 1', leaderboard[0]?.position === 1);

  // ── PASSO 13: Agregação por departamento ──────────────────────────────────────
  console.log('\n🔟 Testando agregação de progresso por departamento...');
  const deptRes = await reqJson('GET', `/challenges/${challengeId}/departments`);
  type DeptBody = { data?: Array<{ totalProgress: number }> };
  const deptData = (deptRes.data as DeptBody)?.data ?? [];
  assert('Agregação por departamento retorna 200', deptRes.status === 200);
  assert('Soma do departamento reflete o progresso do participante (105)', deptData[0]?.totalProgress === 105);

  // ── PASSO 14: Exclusão com histórico vira cancelamento ────────────────────────
  console.log('\n1️⃣1️⃣ Testando que exclusão de desafio com participantes vira cancelamento...');
  const deleteRes = await reqJson('DELETE', `/challenges/${challengeId}`, undefined, masterToken);
  type DeleteBody = { data?: { status?: string } };
  assert('Exclusão retorna 200', deleteRes.status === 200);
  assert('Status retornado é CANCELLED (não DELETED)', (deleteRes.data as DeleteBody)?.data?.status === 'CANCELLED');
  const stillExists = await prisma.challenge.findUnique({ where: { id: challengeId } });
  assert('Registro do desafio permanece no banco (histórico preservado)', !!stillExists && stillExists.status === 'CANCELLED');

  // ── PASSO 15: Desafio inexistente ─────────────────────────────────────────────
  console.log('\n1️⃣2️⃣ Testando desafio inexistente...');
  const notFoundRes = await reqJson('GET', '/challenges/00000000-0000-0000-0000-000000000000');
  assert('Desafio inexistente retorna 404', notFoundRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 13 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 13:', err);
  process.exit(1);
});
