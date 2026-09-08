/**
 * FASE 14 — TESTES AUTOMATIZADOS DE PREMIAÇÕES
 *
 * Cobre:
 * 1. Catálogo de premiações é público (INACTIVE oculto por padrão)
 * 2. Participante não pode criar premiação (403)
 * 3. Criação de premiação customizada pelo admin
 * 4. Resgate com pontos insuficientes é bloqueado (422)
 * 5. Resgate debita o total do usuário (ledger REWARD com pontos negativos)
 * 6. Estoque decrementado após o resgate
 * 7. Estoque zerado marca a premiação como OUT_OF_STOCK automaticamente
 * 8. Resgate com estoque zerado é bloqueado (422)
 * 9. Fluxo administrativo: aprovar -> entregar
 * 10. Entregar sem aprovar antes é bloqueado (422)
 * 11. Cancelamento de resgate estorna os pontos (REVERSAL) e devolve o estoque
 * 12. Cancelar resgate já entregue é bloqueado (422)
 * 13. Participante só vê os próprios resgates; admin vê de todos
 * 14. Premiação inexistente retorna 404
 * 15. Exclusão de premiação com histórico vira desativação
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3988;
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

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 14 — PREMIAÇÕES');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Premiações rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  const otherLogin = await reqJson('POST', '/auth/login', { email: 'beatriz@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; totalPoints?: number } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const otherToken = (otherLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken && !!otherToken);

  // ── PASSO 1: Catálogo público ─────────────────────────────────────────────────
  console.log('\n1️⃣ Testando catálogo público de premiações...');
  const catalogRes = await reqJson('GET', '/rewards');
  assert('Catálogo é público (200 sem token)', catalogRes.status === 200);

  // ── PASSO 2: Bloqueio de criação ──────────────────────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const blockedRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Fake', description: 'teste', pointsCost: 10, quantityAvailable: 5 },
    participantToken,
  );
  assert('Participante não pode criar premiação (403)', blockedRes.status === 403);

  // ── PASSO 3: Criação de premiação de teste (estoque baixo p/ testar esgotamento)
  console.log('\n3️⃣ Testando criação de premiação customizada...');
  // Garante que o participante tem pontos suficientes: aplica um bônus generoso.
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 1000, description: 'Bônus de teste para resgates.' },
    masterToken,
  );

  const createRewardRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Caneca Personalizada de Teste', description: 'Prêmio de teste automatizado.', pointsCost: 300, quantityAvailable: 1 },
    masterToken,
  );
  assert('Premiação criada com sucesso (201)', createRewardRes.status === 201);
  type RewardBody = { data?: { id?: string } };
  const rewardId = (createRewardRes.data as RewardBody)?.data?.id ?? '';

  // ── PASSO 4: Pontos insuficientes ─────────────────────────────────────────────
  console.log('\n4️⃣ Testando bloqueio de resgate com pontos insuficientes...');
  const poorRewardRes = await reqJson(
    'POST',
    '/rewards',
    { title: 'Prêmio Caríssimo de Teste', description: 'Fora do alcance.', pointsCost: 999999, quantityAvailable: 5 },
    masterToken,
  );
  const poorRewardId = (poorRewardRes.data as RewardBody)?.data?.id ?? '';
  const insufficientRes = await reqJson('POST', `/rewards/${poorRewardId}/redeem`, undefined, participantToken);
  assert('Resgate com pontos insuficientes é bloqueado (422)', insufficientRes.status === 422);

  // ── PASSO 5-6: Resgate debita pontos e decrementa estoque ─────────────────────
  console.log('\n5️⃣ Testando resgate bem-sucedido (débito + estoque)...');
  const totalBefore = (await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } }))?.totalPoints ?? 0;

  const redeemRes = await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, participantToken);
  assert('Resgate executado com sucesso (201)', redeemRes.status === 201);
  type RedeemBody = { data?: { userReward?: { id?: string }; transaction?: { points?: number }; newTotalPoints?: number } };
  const redeemData = (redeemRes.data as RedeemBody)?.data;
  const userRewardId = redeemData?.userReward?.id ?? '';

  assert('Transação de débito tem pontos negativos (-300)', redeemData?.transaction?.points === -300);
  assert(
    `Total do usuário foi debitado corretamente (antes: ${totalBefore}, depois: ${redeemData?.newTotalPoints})`,
    redeemData?.newTotalPoints === totalBefore - 300,
  );

  const rewardAfterRedeem = await prisma.reward.findUnique({ where: { id: rewardId } });
  assert('Estoque decrementado para 0', rewardAfterRedeem?.quantityAvailable === 0);
  assert('Status mudou automaticamente para OUT_OF_STOCK', rewardAfterRedeem?.status === 'OUT_OF_STOCK');

  // ── PASSO 8: Resgate com estoque zerado ───────────────────────────────────────
  console.log('\n6️⃣ Testando bloqueio de resgate fora de estoque...');
  const outOfStockRes = await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, otherToken);
  assert('Resgate com estoque zerado é bloqueado (422)', outOfStockRes.status === 422);

  // ── PASSO 9: Fluxo aprovar -> entregar ────────────────────────────────────────
  console.log('\n7️⃣ Testando fluxo administrativo aprovar -> entregar...');
  const deliverBeforeApproveRes = await reqJson('POST', `/rewards/redemptions/${userRewardId}/deliver`, undefined, masterToken);
  assert('Entregar sem aprovar antes é bloqueado (422)', deliverBeforeApproveRes.status === 422);

  const approveRes = await reqJson('POST', `/rewards/redemptions/${userRewardId}/approve`, undefined, masterToken);
  assert('Aprovação do resgate funciona (200)', approveRes.status === 200);

  // ── PASSO 13 (parcial): controle de acesso antes de prosseguir ───────────────
  console.log('\n8️⃣ Testando controle de acesso aos resgates...');
  const ownRedemptionRes = await reqJson('GET', `/rewards/redemptions/${userRewardId}`, undefined, participantToken);
  assert('Dono acessa o próprio resgate (200)', ownRedemptionRes.status === 200);
  const crossRedemptionRes = await reqJson('GET', `/rewards/redemptions/${userRewardId}`, undefined, otherToken);
  assert('Outro participante não pode ver o resgate (403)', crossRedemptionRes.status === 403);

  const ownListRes = await reqJson('GET', '/rewards/redemptions', undefined, participantToken);
  type ListBody = { data?: Array<{ userId: string }> };
  const ownList = (ownListRes.data as ListBody)?.data ?? [];
  assert('Participante só vê os próprios resgates na listagem', ownList.every((r) => r.userId === participantId));

  const adminListRes = await reqJson('GET', `/rewards/redemptions?userId=${participantId}`, undefined, masterToken);
  assert('Admin pode filtrar resgates por userId (200)', adminListRes.status === 200);

  // ── PASSO 11: Cancelamento com estorno ────────────────────────────────────────
  // Cria um segundo resgate (reabastecendo o prêmio) para testar cancelamento sem
  // interferir no fluxo de entrega já validado acima.
  console.log('\n9️⃣ Testando cancelamento com estorno de pontos e reposição de estoque...');
  await prisma.reward.update({ where: { id: rewardId }, data: { quantityAvailable: 1, status: 'AVAILABLE' } });
  const secondRedeemRes = await reqJson('POST', `/rewards/${rewardId}/redeem`, undefined, participantToken);
  const secondUserRewardId = (secondRedeemRes.data as RedeemBody)?.data?.userReward?.id ?? '';
  const totalAfterSecondRedeem = (await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } }))?.totalPoints ?? 0;

  const cancelRes = await reqJson(
    'POST',
    `/rewards/redemptions/${secondUserRewardId}/cancel`,
    { reason: 'Item avariado antes do envio — resgate cancelado.' },
    masterToken,
  );
  assert('Cancelamento executado com sucesso (200)', cancelRes.status === 200);

  const totalAfterCancel = (await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } }))?.totalPoints ?? 0;
  assert(
    `Pontos foram estornados (antes do cancelamento: ${totalAfterSecondRedeem}, depois: ${totalAfterCancel}, esperado +300)`,
    totalAfterCancel === totalAfterSecondRedeem + 300,
  );

  const reversalTx = await prisma.pointsTransaction.findFirst({
    where: { transactionType: 'REVERSAL', userId: participantId, description: { contains: 'Item avariado' } },
  });
  assert('Transação REVERSAL foi criada com o motivo informado', !!reversalTx);

  const rewardAfterCancel = await prisma.reward.findUnique({ where: { id: rewardId } });
  assert('Estoque foi devolvido e status voltou para AVAILABLE', rewardAfterCancel?.quantityAvailable === 1 && rewardAfterCancel?.status === 'AVAILABLE');

  // ── PASSO 12: Cancelar resgate já entregue ────────────────────────────────────
  console.log('\n🔟 Testando bloqueio de cancelamento de resgate já entregue...');
  await reqJson('POST', `/rewards/redemptions/${userRewardId}/deliver`, undefined, masterToken);
  const cancelDeliveredRes = await reqJson(
    'POST',
    `/rewards/redemptions/${userRewardId}/cancel`,
    { reason: 'Tentativa de cancelar após entrega.' },
    masterToken,
  );
  assert('Cancelar resgate já entregue é bloqueado (422)', cancelDeliveredRes.status === 422);

  // ── PASSO 14: Premiação inexistente ───────────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando premiação inexistente...');
  const notFoundRes = await reqJson('GET', '/rewards/00000000-0000-0000-0000-000000000000');
  assert('Premiação inexistente retorna 404', notFoundRes.status === 404);

  // ── PASSO 15: Exclusão com histórico vira desativação ─────────────────────────
  console.log('\n1️⃣2️⃣ Testando que exclusão de premiação com histórico vira desativação...');
  const deleteRes = await reqJson('DELETE', `/rewards/${rewardId}`, undefined, masterToken);
  type DeleteBody = { data?: { status?: string } };
  assert('Exclusão retorna 200', deleteRes.status === 200);
  assert('Status retornado é DEACTIVATED (não DELETED)', (deleteRes.data as DeleteBody)?.data?.status === 'DEACTIVATED');

  const catalogAfterDeactivateRes = await reqJson('GET', '/rewards');
  type CatalogBody = { data?: Array<{ id: string }> };
  const catalogAfterDeactivate = (catalogAfterDeactivateRes.data as CatalogBody)?.data ?? [];
  assert(
    'Premiação desativada não aparece mais no catálogo público padrão',
    !catalogAfterDeactivate.some((r) => r.id === rewardId),
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 14 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 14:', err);
  process.exit(1);
});
