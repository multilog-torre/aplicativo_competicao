/**
 * FASE 12 — TESTES AUTOMATIZADOS DE CONQUISTAS
 *
 * Cobre:
 * 1. Catálogo de conquistas é público (sem autenticação)
 * 2. Participante não pode criar conquista (403)
 * 3. Criação com ruleValue inválido para o ruleType é bloqueada (422)
 * 4. Criação de conquista customizada (ACTIVITY_COUNT) funciona
 * 5. Desbloqueio automático "Primeiro Passo" (ACTIVITY_COUNT=1) ao aprovar a 1ª atividade
 * 6. Ledger recebe transação ACHIEVEMENT com o achievementId correto
 * 7. Nível é reavaliado automaticamente após pontos de recompensa da conquista
 * 8. Mesma conquista nunca é desbloqueada duas vezes para o mesmo usuário
 * 9. Desbloqueio de "Clube dos 1.000" (TOTAL_POINTS) ao cruzar o patamar via BONUS
 * 10. Desbloqueio de conquista customizada (SPECIFIC_MODALITY)
 * 11. GET /achievements/users/:userId — dono acessa, outro participante é bloqueado (403)
 * 12. Admin pode consultar conquistas de qualquer usuário
 * 13. Exclusão de conquista já concedida é convertida em desativação (nunca apaga histórico)
 * 14. Conquista inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3990;
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
  console.log('🧪 INICIANDO TESTES DA FASE 12 — CONQUISTAS');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Conquistas rodando na porta ${TEST_PORT}...\n`);

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

  // ── PASSO 1: Catálogo público ─────────────────────────────────────────────────
  console.log('\n1️⃣ Testando catálogo público de conquistas...');
  const catalogRes = await reqJson('GET', '/achievements');
  type AchievementItem = { id: string; name: string; ruleType: string; ruleValue: Record<string, unknown> };
  type CatalogBody = { data?: AchievementItem[] };
  assert('Catálogo é público (200 sem token)', catalogRes.status === 200);
  const catalog = (catalogRes.data as CatalogBody)?.data ?? [];
  assert('Catálogo do seed presente (3 conquistas)', catalog.length === 3);
  const primeiroPasso = catalog.find((a) => a.name === 'Primeiro Passo');
  const clubeDos1000 = catalog.find((a) => a.name === 'Clube dos 1.000');
  assert('ruleValue já vem desserializado (objeto)', typeof primeiroPasso?.ruleValue === 'object');

  // ── PASSO 2: Bloqueio de criação por participante ─────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const blockedRes = await reqJson(
    'POST',
    '/achievements',
    { name: 'Fake', description: 'teste', ruleType: 'ACTIVITY_COUNT', ruleValue: { count: 1 } },
    participantToken,
  );
  assert('Participante não pode criar conquista (403)', blockedRes.status === 403);

  // ── PASSO 3: ruleValue inválido ────────────────────────────────────────────────
  console.log('\n3️⃣ Testando validação de ruleValue conforme o ruleType...');
  const invalidRuleRes = await reqJson(
    'POST',
    '/achievements',
    { name: 'Regra Inválida', description: 'teste de validação', ruleType: 'TOTAL_POINTS', ruleValue: { count: 5 } },
    masterToken,
  );
  assert('ruleValue incompatível com o ruleType é bloqueado (422)', invalidRuleRes.status === 422);

  // ── PASSO 4: Criação de conquista customizada (SPECIFIC_MODALITY) ────────────
  console.log('\n4️⃣ Testando criação de conquista customizada...');
  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  if (!meditationType) throw new Error('Modalidade Meditação não encontrada no seed.');

  const customAchievementRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Mestre da Meditação',
      description: 'Completou 2 sessões de meditação aprovadas.',
      ruleType: 'SPECIFIC_MODALITY',
      ruleValue: { activityTypeId: meditationType.id, count: 2 },
      pointsReward: 40,
    },
    masterToken,
  );
  assert('Conquista customizada criada (201)', customAchievementRes.status === 201);
  type CreateBody = { data?: { id?: string } };
  const customAchievementId = (customAchievementRes.data as CreateBody)?.data?.id ?? '';

  // ── PASSO 5-7: Desbloqueio automático "Primeiro Passo" + nível ────────────────
  console.log('\n5️⃣ Testando desbloqueio automático ao aprovar a primeira atividade...');
  const beforeUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });

  const createActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string; calculatedPoints?: number } };
  const activity1 = (createActivityRes.data as ActivityBody)?.data;
  const approveRes = await reqJson('POST', `/admin/activities/${activity1?.id}/approve`, undefined, masterToken);
  assert('Aprovação da 1ª atividade funciona (200)', approveRes.status === 200);

  const unlockedRes = await reqJson('GET', `/achievements/users/${participantId}`, undefined, participantToken);
  type UnlockedItem = { achievement: { id: string; name: string } };
  type UnlockedBody = { data?: UnlockedItem[] };
  const unlocked = (unlockedRes.data as UnlockedBody)?.data ?? [];
  assert(
    'Conquista "Primeiro Passo" foi desbloqueada automaticamente',
    unlocked.some((u) => u.achievement.id === primeiroPasso?.id),
  );

  const achievementTx = await prisma.pointsTransaction.findFirst({
    where: { userId: participantId, transactionType: 'ACHIEVEMENT', achievementId: primeiroPasso?.id },
  });
  assert('Ledger recebeu transação ACHIEVEMENT vinculada à conquista', !!achievementTx && achievementTx.points === 50);

  const afterUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  const expectedTotal = (beforeUser?.totalPoints ?? 0) + (activity1?.calculatedPoints ?? 0) + 50; // atividade + conquista
  assert(
    `Total inclui pontos da atividade + recompensa da conquista (esperado ${expectedTotal}, obtido ${afterUser?.totalPoints})`,
    afterUser?.totalPoints === expectedTotal,
  );

  // ── PASSO 8: Nunca desbloqueia a mesma conquista duas vezes ───────────────────
  console.log('\n6️⃣ Testando que a mesma conquista nunca é concedida duas vezes...');
  const createActivity2Res = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  const activity2 = (createActivity2Res.data as ActivityBody)?.data;
  await reqJson('POST', `/admin/activities/${activity2?.id}/approve`, undefined, masterToken);

  const unlockedCountAfter = await prisma.userAchievement.count({
    where: { userId: participantId, achievementId: primeiroPasso?.id },
  });
  assert('Conquista "Primeiro Passo" continua concedida apenas 1 vez', unlockedCountAfter === 1);

  // ── PASSO 9: Desbloqueio "Clube dos 1.000" via BONUS ──────────────────────────
  console.log('\n7️⃣ Testando desbloqueio de conquista por TOTAL_POINTS via BONUS...');
  const currentTotal = (await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } }))?.totalPoints ?? 0;
  const bonusNeeded = 1000 - currentTotal + 10;
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: bonusNeeded, description: 'Bônus de teste para cruzar 1000 pontos.' },
    masterToken,
  );
  const clube1000Unlocked = await prisma.userAchievement.findFirst({
    where: { userId: participantId, achievementId: clubeDos1000?.id },
  });
  assert('Conquista "Clube dos 1.000" desbloqueada automaticamente', !!clube1000Unlocked);

  // ── PASSO 10: Desbloqueio de conquista customizada (SPECIFIC_MODALITY) ───────
  console.log('\n8️⃣ Testando desbloqueio de conquista customizada (2ª sessão de meditação)...');
  const customUnlocked = await prisma.userAchievement.findFirst({
    where: { userId: participantId, achievementId: customAchievementId },
  });
  assert('Conquista "Mestre da Meditação" desbloqueada (2 sessões aprovadas)', !!customUnlocked);

  // ── PASSO 11: Acesso próprio vs. cruzado ──────────────────────────────────────
  console.log('\n9️⃣ Testando controle de acesso às conquistas de outro usuário...');
  const ownAccessRes = await reqJson('GET', `/achievements/users/${participantId}`, undefined, participantToken);
  assert('Dono acessa as próprias conquistas (200)', ownAccessRes.status === 200);

  const crossAccessRes = await reqJson('GET', `/achievements/users/${participantId}`, undefined, otherToken);
  assert('Outro participante não pode ver conquistas alheias (403)', crossAccessRes.status === 403);

  // ── PASSO 12: Admin acessa qualquer usuário ───────────────────────────────────
  const adminAccessRes = await reqJson('GET', `/achievements/users/${participantId}`, undefined, masterToken);
  assert('Admin pode consultar conquistas de qualquer usuário (200)', adminAccessRes.status === 200);

  // ── PASSO 13: Exclusão vira desativação quando já concedida ───────────────────
  console.log('\n🔟 Testando que exclusão de conquista já concedida vira desativação...');
  const deleteRes = await reqJson('DELETE', `/achievements/${primeiroPasso?.id}`, undefined, masterToken);
  type DeleteBody = { data?: { status?: string } };
  assert('Exclusão retorna 200', deleteRes.status === 200);
  assert('Status retornado é DEACTIVATED (não DELETED)', (deleteRes.data as DeleteBody)?.data?.status === 'DEACTIVATED');
  const stillExists = await prisma.achievement.findUnique({ where: { id: primeiroPasso?.id } });
  assert('Registro da conquista permanece no banco (histórico preservado)', !!stillExists && stillExists.status === 'INACTIVE');

  // ── PASSO 14: Conquista inexistente ───────────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando conquista inexistente...');
  const notFoundRes = await reqJson('GET', '/achievements/00000000-0000-0000-0000-000000000000');
  assert('Conquista inexistente retorna 404', notFoundRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 12 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 12:', err);
  process.exit(1);
});
