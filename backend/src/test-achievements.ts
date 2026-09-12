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
 * 15. category/level são persistidos e activityTypeId é preenchido automaticamente
 *     a partir do ruleValue pra ruleTypes ligados a modalidade
 * 16. Validação de ruleValue dos 4 novos tipos de critério (422 quando incompatível)
 * 17. Desbloqueio por CUMULATIVE_QUANTITY (quantidade acumulada de uma modalidade)
 * 18. Desbloqueio por DISTINCT_MODALITIES (atividade aprovada em N modalidades diferentes)
 * 19. Desbloqueio por RANKING_POSITION (posição atual no ranking geral)
 * 20. Desbloqueio por ACCOUNT_TENURE_DAYS (dias desde a criação da conta)
 * 21. GET /achievements/users/:userId/progress traz o catálogo completo com
 *     progresso (current/target/percent) das ainda bloqueadas, self/admin
 * 22. Troca de ícone por emoji (texto) e por upload de imagem (PNG),
 *     incluindo download da imagem enviada e bloqueio pra não-admin
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

async function uploadEvidence(activityId: string, token: string): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'comprovante.jpg');
  await fetch(`${BASE_URL}/activities/${activityId}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function uploadAchievementIcon(achievementId: string, token: string): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('iconType', 'UPLOAD');
  form.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'badge.png');
  const res = await fetch(`${BASE_URL}/achievements/${achievementId}/icon`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[HTTP] PATCH  /achievements/${achievementId}/icon -> ${res.status}`);
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
  type AchievementItem = {
    id: string;
    name: string;
    ruleType: string;
    ruleValue: Record<string, unknown>;
    category?: string;
    level?: string;
    activityTypeId?: string | null;
  };
  type CatalogBody = { data?: AchievementItem[] };
  assert('Catálogo é público (200 sem token)', catalogRes.status === 200);
  const catalog = (catalogRes.data as CatalogBody)?.data ?? [];
  assert(`Catálogo do seed tem pelo menos 20 conquistas (obtido ${catalog.length})`, catalog.length >= 20);
  const primeiroPasso = catalog.find((a) => a.name === 'Primeiro Passo');
  const clubeDos1000 = catalog.find((a) => a.name === 'Clube dos 1.000');
  assert('ruleValue já vem desserializado (objeto)', typeof primeiroPasso?.ruleValue === 'object');

  // Geração automática a partir das modalidades reais: 3 por modalidade (6
  // modalidades no seed = 18) + as transversais + as 3 nomeadas.
  const geradasPorModalidade = catalog.filter((a) => a.category && !['GERAL', 'CONSISTENCIA', 'RANKING_PONTUACAO', 'VARIEDADE', 'TEMPO_DE_CASA'].includes(a.category));
  assert(
    `Pelo menos 18 conquistas foram geradas a partir das modalidades reais (obtido ${geradasPorModalidade.length})`,
    geradasPorModalidade.length >= 18,
  );
  const iniciante = catalog.find((a) => a.name === 'Iniciante em Corrida de Rua / Esteira');
  assert('Conquista gerada por modalidade (bronze) usa CUMULATIVE_QUANTITY', iniciante?.ruleType === 'CUMULATIVE_QUANTITY');
  assert('Conquista gerada por modalidade preenche o activityTypeId', !!iniciante?.activityTypeId);
  const avancado = catalog.find((a) => a.name === 'Avançado em Corrida de Rua / Esteira');
  const mestre = catalog.find((a) => a.name === 'Mestre em Corrida de Rua / Esteira');
  assert(
    'Metas escalam 1x/3x/8x entre bronze/prata/ouro da mesma modalidade',
    (avancado?.ruleValue.targetQuantity as number) === 3 * (iniciante?.ruleValue.targetQuantity as number) &&
      (mestre?.ruleValue.targetQuantity as number) === 8 * (iniciante?.ruleValue.targetQuantity as number),
  );
  const exploradorCompleto = catalog.find((a) => a.name === 'Explorador Completo');
  const totalModalidadesAtivas = new Set(catalog.filter((a) => a.activityTypeId).map((a) => a.activityTypeId)).size;
  assert(
    'Explorador Completo exige atividade em TODAS as modalidades ativas no momento do seed',
    exploradorCompleto?.ruleValue.count === totalModalidadesAtivas,
  );

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
  type UnlockedItem = { achievement: { id: string; name: string; pointsReward: number } };
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

  // Com o catálogo agora tendo 30+ conquistas (incluindo "Centena", 100 pts),
  // o saldo inicial do participante pode cruzar o limiar de mais de uma
  // conquista na MESMA aprovação — soma dinamicamente tudo que foi
  // desbloqueado até aqui em vez de assumir só "Primeiro Passo" (+50).
  const totalRewardsSoFar = unlocked.reduce((sum, u) => sum + u.achievement.pointsReward, 0);
  const afterUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  const expectedTotal = (beforeUser?.totalPoints ?? 0) + (activity1?.calculatedPoints ?? 0) + totalRewardsSoFar;
  assert(
    `Total inclui pontos da atividade + recompensas de conquista já desbloqueadas (esperado ${expectedTotal}, obtido ${afterUser?.totalPoints})`,
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

  const runningType = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });
  if (!runningType) throw new Error('Modalidade de Corrida não encontrada no seed.');

  // ── PASSO 15: category/level persistidos + activityTypeId auto-preenchido ────
  console.log('\n1️⃣2️⃣ Testando category/level/activityTypeId da conquista...');
  type FullAchievementBody = { data?: { id?: string; category?: string; level?: string; activityTypeId?: string | null } };
  const withCategoryRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Corredor Teste',
      description: 'Concluiu 1 corrida aprovada.',
      category: 'TESTE',
      level: 'PRATA',
      ruleType: 'SPECIFIC_MODALITY',
      ruleValue: { activityTypeId: runningType.id, count: 1 },
      pointsReward: 10,
    },
    masterToken,
  );
  const withCategory = (withCategoryRes.data as FullAchievementBody)?.data;
  assert('category informada é persistida', withCategory?.category === 'TESTE');
  assert('level informado é persistido', withCategory?.level === 'PRATA');
  assert(
    'activityTypeId é preenchido automaticamente a partir do ruleValue (SPECIFIC_MODALITY)',
    withCategory?.activityTypeId === runningType.id,
  );

  // ── PASSO 16: Validação dos 4 novos tipos de critério ─────────────────────────
  console.log('\n1️⃣3️⃣ Testando validação de ruleValue dos novos tipos de critério...');
  const invalidCumulative = await reqJson(
    'POST',
    '/achievements',
    { name: 'Inválida CQ', description: 'teste', ruleType: 'CUMULATIVE_QUANTITY', ruleValue: { activityTypeId: runningType.id } },
    masterToken,
  );
  assert('CUMULATIVE_QUANTITY sem targetQuantity é bloqueado (422)', invalidCumulative.status === 422);

  const invalidDistinct = await reqJson(
    'POST',
    '/achievements',
    { name: 'Inválida DM', description: 'teste', ruleType: 'DISTINCT_MODALITIES', ruleValue: { count: 0 } },
    masterToken,
  );
  assert('DISTINCT_MODALITIES com count 0 é bloqueado (422)', invalidDistinct.status === 422);

  const invalidRanking = await reqJson(
    'POST',
    '/achievements',
    { name: 'Inválida RP', description: 'teste', ruleType: 'RANKING_POSITION', ruleValue: {} },
    masterToken,
  );
  assert('RANKING_POSITION sem maxPosition é bloqueado (422)', invalidRanking.status === 422);

  const invalidTenure = await reqJson(
    'POST',
    '/achievements',
    { name: 'Inválida AT', description: 'teste', ruleType: 'ACCOUNT_TENURE_DAYS', ruleValue: { days: -5 } },
    masterToken,
  );
  assert('ACCOUNT_TENURE_DAYS com days negativo é bloqueado (422)', invalidTenure.status === 422);

  // ── PASSO 17-18: CUMULATIVE_QUANTITY + DISTINCT_MODALITIES ────────────────────
  console.log('\n1️⃣4️⃣ Testando desbloqueio por CUMULATIVE_QUANTITY e DISTINCT_MODALITIES...');
  const cumulativeRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Corredor Iniciante',
      description: 'Acumulou 5km de corrida aprovados.',
      ruleType: 'CUMULATIVE_QUANTITY',
      ruleValue: { activityTypeId: runningType.id, targetQuantity: 5 },
      pointsReward: 20,
    },
    masterToken,
  );
  const cumulativeId = (cumulativeRes.data as CreateBody)?.data?.id ?? '';

  const distinctRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Multitarefa Teste',
      description: 'Registrou atividade aprovada em 2 modalidades diferentes.',
      ruleType: 'DISTINCT_MODALITIES',
      ruleValue: { count: 2 },
      pointsReward: 15,
    },
    masterToken,
  );
  const distinctId = (distinctRes.data as CreateBody)?.data?.id ?? '';

  const runActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 5 },
    participantToken,
  );
  const runActivity = (runActivityRes.data as ActivityBody)?.data;
  await uploadEvidence(runActivity?.id ?? '', participantToken); // "Corrida" exige comprovante antes da aprovação
  await reqJson('POST', `/admin/activities/${runActivity?.id}/approve`, undefined, masterToken);

  const cumulativeUnlocked = await prisma.userAchievement.findFirst({ where: { userId: participantId, achievementId: cumulativeId } });
  assert('Conquista "Corredor Iniciante" (CUMULATIVE_QUANTITY, 5km) desbloqueada', !!cumulativeUnlocked);

  const distinctUnlocked = await prisma.userAchievement.findFirst({ where: { userId: participantId, achievementId: distinctId } });
  assert('Conquista "Multitarefa Teste" (DISTINCT_MODALITIES, 2 modalidades) desbloqueada', !!distinctUnlocked);

  // ── PASSO 19: RANKING_POSITION ─────────────────────────────────────────────────
  console.log('\n1️⃣5️⃣ Testando desbloqueio por RANKING_POSITION...');
  type RankingEntryBody = { data?: Array<{ userId: string; position: number }> };
  const rankingBeforeRes = await reqJson('GET', '/ranking?limit=100', undefined, participantToken);
  const currentPosition = ((rankingBeforeRes.data as RankingEntryBody)?.data ?? []).find((e) => e.userId === participantId)?.position ?? 999;

  const rankingAchievementRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Posição Teste',
      description: `Alcançou a posição ${currentPosition} ou melhor no ranking geral.`,
      ruleType: 'RANKING_POSITION',
      ruleValue: { maxPosition: currentPosition },
      pointsReward: 5,
    },
    masterToken,
  );
  const rankingAchievementId = (rankingAchievementRes.data as CreateBody)?.data?.id ?? '';

  // Qualquer crédito de pontos dispara checkAndUnlock — 1 ponto simbólico é suficiente.
  await reqJson('POST', '/scoring/manual', { userId: participantId, transactionType: 'BONUS', points: 1, description: 'Gatilho de teste.' }, masterToken);

  const rankingUnlocked = await prisma.userAchievement.findFirst({ where: { userId: participantId, achievementId: rankingAchievementId } });
  assert(`Conquista "Posição Teste" (RANKING_POSITION <= ${currentPosition}) desbloqueada`, !!rankingUnlocked);

  // ── PASSO 20: ACCOUNT_TENURE_DAYS ──────────────────────────────────────────────
  console.log('\n1️⃣6️⃣ Testando desbloqueio por ACCOUNT_TENURE_DAYS...');
  const backdated = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
  await prisma.user.update({ where: { id: participantId }, data: { createdAt: backdated } });

  const tenureAchievementRes = await reqJson(
    'POST',
    '/achievements',
    {
      name: 'Veterano Teste',
      description: 'Conta criada há pelo menos 90 dias.',
      ruleType: 'ACCOUNT_TENURE_DAYS',
      ruleValue: { days: 90 },
      pointsReward: 5,
    },
    masterToken,
  );
  const tenureAchievementId = (tenureAchievementRes.data as CreateBody)?.data?.id ?? '';

  await reqJson('POST', '/scoring/manual', { userId: participantId, transactionType: 'BONUS', points: 1, description: 'Gatilho de teste.' }, masterToken);

  const tenureUnlocked = await prisma.userAchievement.findFirst({ where: { userId: participantId, achievementId: tenureAchievementId } });
  assert('Conquista "Veterano Teste" (ACCOUNT_TENURE_DAYS >= 90) desbloqueada', !!tenureUnlocked);

  // ── PASSO 21: Catálogo com progresso ────────────────────────────────────────────
  console.log('\n1️⃣7️⃣ Testando GET /achievements/users/:userId/progress...');
  type ProgressItem = {
    id: string;
    name: string;
    unlocked: boolean;
    unlockedAt: string | null;
    progress: { current: number; target: number; percent: number; lowerIsBetter: boolean } | null;
  };
  type ProgressBody = { data?: ProgressItem[] };
  const otherId = (otherLogin.data as LoginBody)?.data?.user?.id ?? '';

  const progressRes = await reqJson('GET', `/achievements/users/${participantId}/progress`, undefined, participantToken);
  assert('Progresso do próprio usuário retorna 200', progressRes.status === 200);
  const progressCatalog = (progressRes.data as ProgressBody)?.data ?? [];

  // Compara com um catálogo FRESCO (não o `catalog` capturado lá no passo 1,
  // que já está desatualizado — várias conquistas foram criadas/desativadas
  // ao longo do teste). O catálogo de progresso deve ter: toda conquista
  // ATIVA agora, mais qualquer uma já desbloqueada que tenha sido desativada
  // nesse meio-tempo (ex.: "Primeiro Passo", desativada no passo 10).
  const freshCatalogRes = await reqJson('GET', '/achievements');
  type FreshCatalogItem = { id: string; status: string };
  const freshCatalog = (freshCatalogRes.data as { data?: FreshCatalogItem[] })?.data ?? [];
  const freshUnlockedRes = await reqJson('GET', `/achievements/users/${participantId}`, undefined, participantToken);
  const freshUnlocked = (freshUnlockedRes.data as UnlockedBody)?.data ?? [];
  const activeCount = freshCatalog.filter((a) => a.status === 'ACTIVE').length;
  const unlockedInactiveCount = freshCatalog.filter(
    (a) => a.status !== 'ACTIVE' && freshUnlocked.some((u) => u.achievement.id === a.id),
  ).length;
  assert(
    `Catálogo de progresso tem as ativas + as já desbloqueadas mesmo desativadas (esperado ${activeCount + unlockedInactiveCount}, obtido ${progressCatalog.length})`,
    progressCatalog.length === activeCount + unlockedInactiveCount,
  );

  const unlockedInProgress = progressCatalog.find((p) => p.name === 'Primeiro Passo');
  assert('Conquista já desbloqueada aparece com unlocked=true e progress=null', unlockedInProgress?.unlocked === true && unlockedInProgress?.progress === null);

  const avancadoCorrida = progressCatalog.find((p) => p.name === 'Avançado em Corrida de Rua / Esteira');
  assert(
    'Conquista ainda bloqueada traz progress {current, target, percent}',
    avancadoCorrida?.unlocked === false &&
      typeof avancadoCorrida?.progress?.current === 'number' &&
      typeof avancadoCorrida?.progress?.target === 'number' &&
      (avancadoCorrida?.progress?.percent ?? -1) >= 0 &&
      (avancadoCorrida?.progress?.percent ?? 101) <= 100,
  );
  assert(
    `Progresso reflete os 5km já acumulados (current=5, obtido ${avancadoCorrida?.progress?.current})`,
    avancadoCorrida?.progress?.current === 5,
  );

  const progressCrossRes = await reqJson('GET', `/achievements/users/${participantId}/progress`, undefined, otherToken);
  assert('Outro participante não pode ver o progresso alheio (403)', progressCrossRes.status === 403);

  const progressAdminRes = await reqJson('GET', `/achievements/users/${participantId}/progress`, undefined, masterToken);
  assert('Admin pode consultar o progresso de qualquer usuário (200)', progressAdminRes.status === 200);

  // ── PASSO 22: Troca de ícone (emoji e upload de imagem) ────────────────────────
  console.log('\n1️⃣8️⃣ Testando troca de ícone (emoji e upload de imagem)...');
  const emojiIconRes = await reqJson(
    'PATCH',
    `/achievements/${withCategory?.id}/icon`,
    { iconType: 'EMOJI', icon: '🔥' },
    masterToken,
  );
  type IconBody = { data?: { icon?: string; iconType?: string } };
  assert('Troca de ícone por emoji retorna 200', emojiIconRes.status === 200);
  assert('Ícone emoji é persistido como texto', (emojiIconRes.data as IconBody)?.data?.icon === '🔥');
  assert('iconType fica EMOJI', (emojiIconRes.data as IconBody)?.data?.iconType === 'EMOJI');

  const emojiIconBlockedRes = await reqJson(
    'PATCH',
    `/achievements/${withCategory?.id}/icon`,
    { iconType: 'EMOJI', icon: '⭐' },
    participantToken,
  );
  assert('Participante não pode trocar o ícone de uma conquista (403)', emojiIconBlockedRes.status === 403);

  const uploadIconRes = await uploadAchievementIcon(withCategory?.id ?? '', masterToken);
  assert('Upload de imagem do ícone retorna 200', uploadIconRes.status === 200);
  const uploadedIcon = (uploadIconRes.data as IconBody)?.data;
  assert('iconType fica UPLOAD', uploadedIcon?.iconType === 'UPLOAD');
  assert(
    'icon retornado é uma URL do backend (nunca o caminho de armazenamento cru)',
    typeof uploadedIcon?.icon === 'string' && uploadedIcon.icon.startsWith(`/api/v1/achievements/${withCategory?.id}/icon`),
  );

  const iconDownloadRes = await fetch(`${BASE_URL}/achievements/${withCategory?.id}/icon`);
  console.log(`[HTTP] GET    /achievements/${withCategory?.id}/icon -> ${iconDownloadRes.status}`);
  assert('Download da imagem do ícone funciona SEM autenticação (catálogo é público)', iconDownloadRes.status === 200);
  assert('Content-Type reflete a imagem enviada (PNG)', iconDownloadRes.headers.get('content-type') === 'image/png');

  const noImageIconRes = await fetch(`${BASE_URL}/achievements/${customAchievementId}/icon`);
  assert('Download de ícone de conquista sem imagem enviada retorna 404', noImageIconRes.status === 404);

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
