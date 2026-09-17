/**
 * FASE 16 — TESTES AUTOMATIZADOS DE NOTIFICAÇÕES
 *
 * Cobre:
 * 1. Notificações exigem autenticação (401 sem token)
 * 2. Aprovação de atividade gera notificação ACTIVITY_APPROVED
 * 3. Rejeição de atividade gera notificação ACTIVITY_REJECTED com o motivo
 * 4. Lançamento manual (BONUS) gera notificação POINTS_ADJUSTED
 * 5. Reversão de transação gera notificação POINTS_ADJUSTED
 * 6. Nível alcançado gera notificação LEVEL_UP (e não dispara em queda de nível)
 * 7. Conquista desbloqueada gera notificação ACHIEVEMENT_UNLOCKED
 * 8. Conclusão de desafio gera notificação CHALLENGE_COMPLETED
 * 9. Aprovação/entrega de resgate geram notificações REWARD_UPDATE
 * 10. Contador de não lidas reflete corretamente as notificações pendentes
 * 11. Marcar uma notificação como lida funciona e reduz o contador
 * 12. Marcar todas como lidas zera o contador
 * 13. Participante não pode marcar notificação de outro usuário como lida (403)
 * 14. Filtro por isRead funciona na listagem
 * 15. Excluir notificação própria funciona e ela some da listagem
 * 16. Participante não pode excluir notificação de outro usuário (403)
 * 17. Excluir notificação inexistente retorna 404
 * 18. Excluir TODAS as notificações do próprio usuário funciona e não afeta outro usuário
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3986;
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

type Notification = { id: string; title: string; type: string; message: string; isRead: boolean; referenceId: string | null };
type NotifBody = { data?: Notification[] };

async function findLatestNotification(token: string, type: string): Promise<Notification | undefined> {
  const res = await reqJson('GET', '/notifications?limit=100', undefined, token);
  return ((res.data as NotifBody)?.data ?? []).find((n) => n.type === type);
}

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 16 — NOTIFICAÇÕES');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Notificações rodando na porta ${TEST_PORT}...\n`);

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

  // ── PASSO 1: Autenticação obrigatória ─────────────────────────────────────────
  console.log('\n1️⃣ Testando exigência de autenticação...');
  const unauthenticatedRes = await reqJson('GET', '/notifications');
  assert('Notificações sem token retornam 401', unauthenticatedRes.status === 401);

  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  const runningType = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });
  if (!meditationType || !runningType) throw new Error('Modalidades esperadas do seed não encontradas.');

  // ── PASSO 2: Aprovação gera notificação ───────────────────────────────────────
  console.log('\n2️⃣ Testando notificação de atividade aprovada...');
  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string } };
  const activityId = (createRes.data as ActivityBody)?.data?.id ?? '';
  await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, masterToken);

  const approvedNotif = await findLatestNotification(participantToken, 'ACTIVITY_APPROVED');
  assert('Notificação ACTIVITY_APPROVED foi criada', !!approvedNotif && approvedNotif.referenceId === activityId);

  // ── PASSO 3: Rejeição gera notificação ────────────────────────────────────────
  console.log('\n3️⃣ Testando notificação de atividade rejeitada...');
  const createRejectRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  const rejectActivityId = (createRejectRes.data as ActivityBody)?.data?.id ?? '';
  const rejectionReason = 'Evidência insuficiente para validar a atividade.';
  await reqJson('POST', `/admin/activities/${rejectActivityId}/reject`, { reason: rejectionReason }, masterToken);

  const rejectedNotif = await findLatestNotification(participantToken, 'ACTIVITY_REJECTED');
  assert(
    'Notificação ACTIVITY_REJECTED contém o motivo informado',
    !!rejectedNotif && rejectedNotif.message.includes(rejectionReason),
  );

  // ── PASSO 4-5: Bônus e reversão geram notificação de pontos ───────────────────
  console.log('\n4️⃣ Testando notificação de lançamento manual e reversão...');
  const bonusRes = await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 40, description: 'Bônus de teste de notificação.' },
    masterToken,
  );
  type ManualBody = { data?: { transaction?: { id?: string } } };
  const bonusTransactionId = (bonusRes.data as ManualBody)?.data?.transaction?.id ?? '';

  const bonusNotif = await findLatestNotification(participantToken, 'POINTS_ADJUSTED');
  assert('Notificação POINTS_ADJUSTED criada para o BONUS', !!bonusNotif && bonusNotif.referenceId === bonusTransactionId);

  const reversalReason = 'Bônus concedido em duplicidade — teste de notificação.';
  await reqJson('POST', `/scoring/transactions/${bonusTransactionId}/reverse`, { reason: reversalReason }, masterToken);
  const reversalNotifRes = await reqJson('GET', '/notifications?limit=100', undefined, participantToken);
  const reversalNotif = ((reversalNotifRes.data as NotifBody)?.data ?? []).find(
    (n) => n.type === 'POINTS_ADJUSTED' && n.message.includes(reversalReason),
  );
  assert('Notificação POINTS_ADJUSTED criada para a REVERSAL, com o motivo', !!reversalNotif);

  // ── PASSO 6: Novo nível ────────────────────────────────────────────────────────
  console.log('\n5️⃣ Testando notificação de novo nível (e ausência em queda de nível)...');
  const explorador = await prisma.level.findFirst({ where: { name: 'Explorador' } });
  const currentTotal = (await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } }))?.totalPoints ?? 0;
  const bonusToLevelUp = (explorador?.minPoints ?? 500) - currentTotal + 10;
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: bonusToLevelUp, description: 'Bônus para subir de nível.' },
    masterToken,
  );
  const levelUpNotif = await findLatestNotification(participantToken, 'LEVEL_UP');
  assert('Notificação LEVEL_UP foi criada ao alcançar o Explorador', !!levelUpNotif && levelUpNotif.referenceId === explorador?.id);

  const levelUpCountBefore = (
    (await reqJson('GET', '/notifications?limit=100', undefined, participantToken)).data as NotifBody
  )?.data?.filter((n) => n.type === 'LEVEL_UP').length ?? 0;
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'PENALTY', points: bonusToLevelUp, description: 'Penalidade para cair de nível.' },
    masterToken,
  );
  const levelUpCountAfterPenalty = (
    (await reqJson('GET', '/notifications?limit=100', undefined, participantToken)).data as NotifBody
  )?.data?.filter((n) => n.type === 'LEVEL_UP').length ?? 0;
  assert('Queda de nível NÃO gera nova notificação LEVEL_UP', levelUpCountAfterPenalty === levelUpCountBefore);

  // ── PASSO 7: Conquista desbloqueada ───────────────────────────────────────────
  console.log('\n6️⃣ Testando notificação de conquista desbloqueada...');
  const achievementNotif = await findLatestNotification(participantToken, 'ACHIEVEMENT_UNLOCKED');
  assert('Notificação ACHIEVEMENT_UNLOCKED foi criada (Primeiro Passo)', !!achievementNotif);

  // ── PASSO 8: Desafio concluído ─────────────────────────────────────────────────
  console.log('\n7️⃣ Testando notificação de desafio concluído...');
  const now = new Date();
  const challengeRes = await reqJson(
    'POST',
    '/challenges',
    {
      title: 'Desafio de Notificação',
      description: 'Teste automatizado.',
      startDate: new Date(now.getTime() - 86400000).toISOString(),
      endDate: new Date(now.getTime() + 86400000 * 10).toISOString(),
      activityTypeId: runningType.id,
      targetGoal: 5,
      unit: 'km',
      rewardPoints: 60,
    },
    masterToken,
  );
  type ChallengeBody = { data?: { id?: string } };
  const challengeId = (challengeRes.data as ChallengeBody)?.data?.id ?? '';
  await reqJson('POST', `/challenges/${challengeId}/join`, undefined, otherToken);

  const runActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 5 },
    otherToken,
  );
  const runActivityId = (runActivityRes.data as ActivityBody)?.data?.id ?? '';
  await uploadEvidence(runActivityId, otherToken);
  await reqJson('POST', `/admin/activities/${runActivityId}/approve`, undefined, masterToken);

  const challengeNotif = await findLatestNotification(otherToken, 'CHALLENGE_COMPLETED');
  assert('Notificação CHALLENGE_COMPLETED foi criada', !!challengeNotif && challengeNotif.referenceId === challengeId);

  // ── PASSO 9: Resgate de premiação ─────────────────────────────────────────────
  console.log('\n8️⃣ Testando notificações do ciclo de resgate de premiação...');
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 1000, description: 'Bônus para resgate de teste.' },
    masterToken,
  );
  const rewardRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Prêmio de Teste de Notificação', description: 'teste', pointsCost: 100, quantityAvailable: 5 },
    masterToken,
  );
  type RewardBody = { data?: { id?: string } };
  const rewardId = (rewardRes.data as RewardBody)?.data?.id ?? '';
  const redeemRes = await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, participantToken);
  type RedeemBody = { data?: { userReward?: { id?: string } } };
  const userRewardId = (redeemRes.data as RedeemBody)?.data?.userReward?.id ?? '';

  await reqJson('POST', `/rewards/redemptions/${userRewardId}/approve`, undefined, masterToken);
  const approveNotif = await findLatestNotification(participantToken, 'REWARD_UPDATE');
  assert('Notificação REWARD_UPDATE criada na aprovação do resgate', !!approveNotif);

  await reqJson('POST', `/rewards/redemptions/${userRewardId}/deliver`, undefined, masterToken);
  const deliverNotifRes = await reqJson('GET', '/notifications?limit=100', undefined, participantToken);
  const deliverNotif = ((deliverNotifRes.data as NotifBody)?.data ?? []).find(
    (n) => n.type === 'REWARD_UPDATE' && n.message.includes('entregue'),
  );
  assert('Notificação REWARD_UPDATE criada na entrega do resgate', !!deliverNotif);

  // ── PASSO 10-12: Contador e marcação de lidas ─────────────────────────────────
  console.log('\n9️⃣ Testando contador de não lidas e marcação como lida...');
  const unreadCountRes = await reqJson('GET', '/notifications/unread-count', undefined, participantToken);
  type CountBody = { data?: { count?: number } };
  const unreadCount = (unreadCountRes.data as CountBody)?.data?.count ?? 0;
  assert('Contador de não lidas é maior que zero', unreadCount > 0);

  const listRes = await reqJson('GET', '/notifications?limit=1', undefined, participantToken);
  const firstNotifId = ((listRes.data as NotifBody)?.data ?? [])[0]?.id ?? '';
  const markReadRes = await reqJson('POST', `/notifications/${firstNotifId}/read`, undefined, participantToken);
  assert('Marcar notificação como lida funciona (200)', markReadRes.status === 200);

  const unreadCountAfterOneRes = await reqJson('GET', '/notifications/unread-count', undefined, participantToken);
  const unreadCountAfterOne = (unreadCountAfterOneRes.data as CountBody)?.data?.count ?? 0;
  assert('Contador diminuiu em 1 após marcar uma como lida', unreadCountAfterOne === unreadCount - 1);

  const markAllRes = await reqJson('POST', '/notifications/read-all', undefined, participantToken);
  assert('Marcar todas como lidas funciona (200)', markAllRes.status === 200);
  const unreadCountFinalRes = await reqJson('GET', '/notifications/unread-count', undefined, participantToken);
  assert('Contador final é 0', (unreadCountFinalRes.data as CountBody)?.data?.count === 0);

  // ── PASSO 13: Acesso cruzado bloqueado ────────────────────────────────────────
  console.log('\n🔟 Testando bloqueio de marcação de notificação de outro usuário...');
  const otherListRes = await reqJson('GET', '/notifications?limit=1', undefined, otherToken);
  const otherNotifId = ((otherListRes.data as NotifBody)?.data ?? [])[0]?.id ?? '';
  if (otherNotifId) {
    const crossMarkRes = await reqJson('POST', `/notifications/${otherNotifId}/read`, undefined, participantToken);
    assert('Participante não pode marcar notificação de outro usuário como lida (403)', crossMarkRes.status === 403);
  } else {
    assert('(sem notificação de outro usuário para testar acesso cruzado — pulado)', true);
  }

  // ── PASSO 14: Filtro por isRead ────────────────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando filtro por isRead...');
  const unreadFilterRes = await reqJson('GET', '/notifications?isRead=false', undefined, participantToken);
  const unreadFiltered = (unreadFilterRes.data as NotifBody)?.data ?? [];
  assert('Filtro isRead=false retorna apenas não lidas (todas já lidas -> vazio)', unreadFiltered.length === 0);

  // ── PASSO 15-17: Exclusão de notificação ──────────────────────────────────────
  console.log('\n1️⃣2️⃣ Testando exclusão de notificação...');
  const beforeDeleteRes = await reqJson('GET', '/notifications?limit=100', undefined, participantToken);
  const toDeleteId = ((beforeDeleteRes.data as NotifBody)?.data ?? [])[0]?.id ?? '';
  const totalBeforeDelete = ((beforeDeleteRes.data as NotifBody)?.data ?? []).length;

  const deleteRes = await reqJson('DELETE', `/notifications/${toDeleteId}`, undefined, participantToken);
  assert('Excluir notificação própria funciona (200)', deleteRes.status === 200);

  const afterDeleteRes = await reqJson('GET', '/notifications?limit=100', undefined, participantToken);
  const afterDeleteList = (afterDeleteRes.data as NotifBody)?.data ?? [];
  assert('Notificação excluída some da listagem', !afterDeleteList.some((n) => n.id === toDeleteId));
  assert('Total da listagem diminuiu em 1', afterDeleteList.length === totalBeforeDelete - 1);

  const otherListForDeleteRes = await reqJson('GET', '/notifications?limit=1', undefined, otherToken);
  const otherIdForDelete = ((otherListForDeleteRes.data as NotifBody)?.data ?? [])[0]?.id ?? '';
  if (otherIdForDelete) {
    const crossDeleteRes = await reqJson('DELETE', `/notifications/${otherIdForDelete}`, undefined, participantToken);
    assert('Participante não pode excluir notificação de outro usuário (403)', crossDeleteRes.status === 403);
  } else {
    assert('(sem notificação de outro usuário para testar exclusão cruzada — pulado)', true);
  }

  const deleteNonExistentRes = await reqJson(
    'DELETE',
    '/notifications/00000000-0000-0000-0000-000000000000',
    undefined,
    participantToken,
  );
  assert('Excluir notificação inexistente retorna 404', deleteNonExistentRes.status === 404);

  // ── PASSO 18: Excluir todas ───────────────────────────────────────────────────
  console.log('\n1️⃣3️⃣ Testando exclusão de todas as notificações...');
  const otherCountBeforeDeleteAllRes = await reqJson('GET', '/notifications?limit=100', undefined, otherToken);
  const otherCountBeforeDeleteAll = ((otherCountBeforeDeleteAllRes.data as NotifBody)?.data ?? []).length;
  assert('Outro usuário tem notificações antes do "excluir todas" do participante', otherCountBeforeDeleteAll > 0);

  const deleteAllRes = await reqJson('DELETE', '/notifications', undefined, participantToken);
  assert('Excluir todas as notificações funciona (200)', deleteAllRes.status === 200);

  const afterDeleteAllRes = await reqJson('GET', '/notifications?limit=100', undefined, participantToken);
  assert('Listagem do participante fica vazia após "excluir todas"', ((afterDeleteAllRes.data as NotifBody)?.data ?? []).length === 0);

  const otherCountAfterDeleteAllRes = await reqJson('GET', '/notifications?limit=100', undefined, otherToken);
  assert(
    '"Excluir todas" não afeta as notificações de outro usuário',
    ((otherCountAfterDeleteAllRes.data as NotifBody)?.data ?? []).length === otherCountBeforeDeleteAll,
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 16 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 16:', err);
  process.exit(1);
});
