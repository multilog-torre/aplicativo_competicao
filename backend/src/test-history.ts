/**
 * FASE 19 — TESTES AUTOMATIZADOS DO HISTÓRICO DO USUÁRIO
 *
 * Cobre:
 * 1. "Meu histórico" de atividades já funciona via GET /activities (Fase 6)
 * 2. "Histórico de pontos" já funciona via GET /scoring/transactions (Fase 5)
 * 3. NOVO: detalhe de transação ACTIVITY resolve modalidade, quantidade, aprovador e data
 * 4. NOVO: detalhe de transação BONUS resolve quem concedeu (grantedBy)
 * 5. NOVO: detalhe de transação ACHIEVEMENT resolve nome/descrição da conquista
 * 6. NOVO: detalhe de transação CHALLENGE resolve o título do desafio
 * 7. NOVO: detalhe de transação REWARD resolve o prêmio e o ID do resgate
 * 8. NOVO: detalhe de transação REVERSAL resolve a transação original revertida
 * 9. Participante não pode ver o detalhe de transação de outro usuário (403)
 * 10. Admin pode ver o detalhe de transação de qualquer usuário
 * 11. Transação inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3983;
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

type DetailBody = { data?: { id: string; transactionType: string; points: number; origin: Record<string, unknown> | null } };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 19 — HISTÓRICO DO USUÁRIO');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Histórico rodando na porta ${TEST_PORT}...\n`);

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

  // ── PASSO 1-2: Telas de histórico já existentes (Fases 5/6) ──────────────────
  console.log('\n1️⃣ Confirmando que as telas de histórico já funcionam (Fases 5/6)...');
  const activitiesRes = await reqJson('GET', '/activities', undefined, participantToken);
  assert('"Meu histórico" (atividades) responde 200', activitiesRes.status === 200);
  const transactionsListRes = await reqJson('GET', '/scoring/transactions', undefined, participantToken);
  assert('"Histórico de pontos" (transações) responde 200', transactionsListRes.status === 200);

  // ── Prepara cenário: aprovação de atividade (origem ACTIVITY) ────────────────
  console.log('\n2️⃣ Testando detalhe de transação ACTIVITY...');
  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 5 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string } };
  const activityId = (createRes.data as ActivityBody)?.data?.id ?? '';
  await uploadEvidence(activityId, participantToken);
  await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, masterToken);

  const activityTxRow = await prisma.pointsTransaction.findFirst({ where: { activityId, transactionType: 'ACTIVITY' } });
  const activityTxDetailRes = await reqJson('GET', `/scoring/transactions/${activityTxRow?.id}`, undefined, participantToken);
  assert('Detalhe da transação ACTIVITY retorna 200', activityTxDetailRes.status === 200);
  const activityOrigin = (activityTxDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
  assert('origin.type === ACTIVITY', activityOrigin?.type === 'ACTIVITY');
  assert('origin resolve a modalidade (Corrida)', (activityOrigin?.activityTypeName as string)?.includes('Corrida'));
  assert('origin resolve a quantidade (5)', activityOrigin?.quantity === 5);
  assert('origin resolve quem aprovou', (activityOrigin?.approvedBy as { name?: string })?.name === 'Administrador Master');
  assert('origin resolve a data de aprovação', !!activityOrigin?.approvedAt);

  // ── PASSO 4: BONUS ────────────────────────────────────────────────────────────
  console.log('\n3️⃣ Testando detalhe de transação BONUS...');
  const bonusRes = await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 30, description: 'Bônus de teste de histórico.' },
    masterToken,
  );
  type ManualBody = { data?: { transaction?: { id?: string } } };
  const bonusTxId = (bonusRes.data as ManualBody)?.data?.transaction?.id ?? '';
  const bonusDetailRes = await reqJson('GET', `/scoring/transactions/${bonusTxId}`, undefined, participantToken);
  const bonusOrigin = (bonusDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
  assert('origin.type === BONUS', bonusOrigin?.type === 'BONUS');
  assert('origin resolve quem concedeu (grantedBy)', (bonusOrigin?.grantedBy as { name?: string })?.name === 'Administrador Master');

  // ── PASSO 5: ACHIEVEMENT ──────────────────────────────────────────────────────
  console.log('\n4️⃣ Testando detalhe de transação ACHIEVEMENT...');
  const achievementTx = await prisma.pointsTransaction.findFirst({ where: { userId: participantId, transactionType: 'ACHIEVEMENT' } });
  assert('Existe ao menos uma transação ACHIEVEMENT (desbloqueada automaticamente)', !!achievementTx);
  if (achievementTx) {
    const achievementDetailRes = await reqJson('GET', `/scoring/transactions/${achievementTx.id}`, undefined, participantToken);
    const achievementOrigin = (achievementDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
    assert('origin.type === ACHIEVEMENT', achievementOrigin?.type === 'ACHIEVEMENT');
    assert('origin resolve o nome da conquista', typeof achievementOrigin?.achievementName === 'string');
  }

  // ── PASSO 6: CHALLENGE ────────────────────────────────────────────────────────
  console.log('\n5️⃣ Testando detalhe de transação CHALLENGE...');
  const now = new Date();
  const challengeRes = await reqJson(
    'POST',
    '/challenges',
    {
      title: 'Desafio de Teste de Histórico',
      description: 'teste',
      startDate: new Date(now.getTime() - 86400000).toISOString(),
      endDate: new Date(now.getTime() + 86400000).toISOString(),
      activityTypeId: runningType.id,
      targetGoal: 1,
      rewardPoints: 50,
    },
    masterToken,
  );
  type ChallengeBody = { data?: { id?: string } };
  const challengeId = (challengeRes.data as ChallengeBody)?.data?.id ?? '';
  await reqJson('POST', `/challenges/${challengeId}/join`, undefined, otherToken);
  const challengeActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 1 },
    otherToken,
  );
  const challengeActivityId = (challengeActivityRes.data as ActivityBody)?.data?.id ?? '';
  await uploadEvidence(challengeActivityId, otherToken);
  await reqJson('POST', `/admin/activities/${challengeActivityId}/approve`, undefined, masterToken);

  const challengeTx = await prisma.pointsTransaction.findFirst({ where: { transactionType: 'CHALLENGE', challengeId } });
  assert('Transação CHALLENGE foi criada', !!challengeTx);
  if (challengeTx) {
    const challengeDetailRes = await reqJson('GET', `/scoring/transactions/${challengeTx.id}`, undefined, otherToken);
    const challengeOrigin = (challengeDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
    assert('origin.type === CHALLENGE', challengeOrigin?.type === 'CHALLENGE');
    assert('origin resolve o título do desafio', challengeOrigin?.challengeTitle === 'Desafio de Teste de Histórico');
  }

  // ── PASSO 7: REWARD ───────────────────────────────────────────────────────────
  console.log('\n6️⃣ Testando detalhe de transação REWARD...');
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 500, description: 'Bônus para resgate de teste.' },
    masterToken,
  );
  const rewardRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Prêmio de Teste de Histórico', description: 'teste', pointsCost: 100, quantityAvailable: 5 },
    masterToken,
  );
  type RewardBody = { data?: { id?: string } };
  const rewardId = (rewardRes.data as RewardBody)?.data?.id ?? '';
  const redeemRes = await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, participantToken);
  type RedeemBody = { data?: { transaction?: { id?: string }; userReward?: { id?: string } } };
  const redeemTxId = (redeemRes.data as RedeemBody)?.data?.transaction?.id ?? '';
  const redeemUserRewardId = (redeemRes.data as RedeemBody)?.data?.userReward?.id ?? '';

  const rewardDetailRes = await reqJson('GET', `/scoring/transactions/${redeemTxId}`, undefined, participantToken);
  const rewardOrigin = (rewardDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
  assert('origin.type === REWARD', rewardOrigin?.type === 'REWARD');
  assert('origin resolve o título do prêmio', rewardOrigin?.rewardTitle === 'Prêmio de Teste de Histórico');
  assert('origin resolve o ID do resgate (redemptionId)', rewardOrigin?.redemptionId === redeemUserRewardId);

  // ── PASSO 8: REVERSAL ─────────────────────────────────────────────────────────
  console.log('\n7️⃣ Testando detalhe de transação REVERSAL...');
  const reversalReason = 'Bônus concedido em duplicidade — teste de histórico.';
  const reversalRes = await reqJson('POST', `/scoring/transactions/${bonusTxId}/reverse`, { reason: reversalReason }, masterToken);
  type ReversalBody = { data?: { reversalTransaction?: { id?: string } } };
  const reversalTxId = (reversalRes.data as ReversalBody)?.data?.reversalTransaction?.id ?? '';
  const reversalDetailRes = await reqJson('GET', `/scoring/transactions/${reversalTxId}`, undefined, participantToken);
  const reversalOrigin = (reversalDetailRes.data as DetailBody)?.data?.origin as Record<string, unknown> | undefined;
  assert('origin.type === REVERSAL', reversalOrigin?.type === 'REVERSAL');
  assert('origin resolve a transação original revertida', (reversalOrigin?.reversedTransaction as { id?: string })?.id === bonusTxId);

  // ── PASSO 9-10: Controle de acesso ────────────────────────────────────────────
  console.log('\n8️⃣ Testando controle de acesso ao detalhe de transação...');
  const crossAccessRes = await reqJson('GET', `/scoring/transactions/${bonusTxId}`, undefined, otherToken);
  assert('Outro participante não pode ver a transação (403)', crossAccessRes.status === 403);

  const adminAccessRes = await reqJson('GET', `/scoring/transactions/${bonusTxId}`, undefined, masterToken);
  assert('Admin pode ver a transação de qualquer usuário (200)', adminAccessRes.status === 200);

  // ── PASSO 11: Transação inexistente ───────────────────────────────────────────
  console.log('\n9️⃣ Testando transação inexistente...');
  const notFoundRes = await reqJson('GET', '/scoring/transactions/00000000-0000-0000-0000-000000000000', undefined, participantToken);
  assert('Transação inexistente retorna 404', notFoundRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 19 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 19:', err);
  process.exit(1);
});
