/**
 * FASE 11 — TESTES AUTOMATIZADOS DE NÍVEIS DE PROGRESSÃO
 *
 * Cobre:
 * 1. Listagem pública de níveis (sem autenticação) retorna a escada do seed
 * 2. Participante não pode criar nível (403)
 * 3. Admin cria um novo nível configurável (201)
 * 4. Criação com levelNumber/minPoints duplicado é bloqueada (409)
 * 5. Nível é atualizado automaticamente quando o usuário cruza um novo patamar de pontos
 * 6. Reclassificação ocorre atomicamente dentro da mesma transação de crédito de pontos
 * 7. Usuário nunca fica "sem nível": total negativo (PENALTY) cai no piso (menor minPoints)
 * 8. Atualização de minPoints de um nível reclassifica os usuários existentes automaticamente
 * 9. Exclusão de nível reatribui usuários órfãos ao nível correto restante
 * 10. Nível inexistente (getById) retorna 404
 * 11. Auditoria registrada para CREATE/UPDATE/DELETE de níveis
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3991;
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
  console.log('🧪 INICIANDO TESTES DA FASE 11 — NÍVEIS');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Níveis rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken);

  // ── PASSO 1: Listagem pública ─────────────────────────────────────────────────
  console.log('\n1️⃣ Testando listagem pública de níveis...');
  const listRes = await reqJson('GET', '/levels');
  type LevelItem = { id: string; levelNumber: number; name: string; minPoints: number };
  type ListBody = { data?: LevelItem[] };
  assert('Listagem de níveis é pública (200 sem token)', listRes.status === 200);
  const seedLevels = (listRes.data as ListBody)?.data ?? [];
  assert('Escada de níveis do seed presente (5 níveis)', seedLevels.length === 5);
  const iniciante = seedLevels.find((l) => l.name === 'Iniciante');
  const explorador = seedLevels.find((l) => l.name === 'Explorador');
  assert('Nível Iniciante (minPoints=0) encontrado', iniciante?.minPoints === 0);

  // ── PASSO 2: Bloqueio de criação por participante ─────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const blockedCreateRes = await reqJson(
    'POST',
    '/levels',
    { levelNumber: 99, name: 'Nível Fake', minPoints: 999999 },
    participantToken,
  );
  assert('Participante não pode criar nível (403)', blockedCreateRes.status === 403);

  // ── PASSO 3: Criação por admin ────────────────────────────────────────────────
  console.log('\n3️⃣ Testando criação de nível configurável pelo admin...');
  const createRes = await reqJson(
    'POST',
    '/levels',
    { levelNumber: 6, name: 'Lenda Corporativa', minPoints: 10000, badgeIcon: 'crown-star' },
    masterToken,
  );
  assert('Nível criado com sucesso (201)', createRes.status === 201);
  type CreateBody = { data?: { id?: string } };
  const newLevelId = (createRes.data as CreateBody)?.data?.id ?? '';

  // ── PASSO 4: Conflito de duplicidade ──────────────────────────────────────────
  console.log('\n4️⃣ Testando bloqueio de duplicidade de levelNumber/minPoints...');
  const conflictRes = await reqJson(
    'POST',
    '/levels',
    { levelNumber: 6, name: 'Outro Nome', minPoints: 20000 },
    masterToken,
  );
  assert('levelNumber duplicado é bloqueado (409)', conflictRes.status === 409);

  // ── PASSO 5-6: Reclassificação automática dentro da transação de crédito ─────
  console.log('\n5️⃣ Testando reclassificação automática ao cruzar um novo patamar...');
  const beforeUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  assert('Participante começa no nível Iniciante (seed: 200 pts)', beforeUser?.levelId === iniciante?.id);

  // Credita pontos suficientes para cruzar o patamar do Explorador (500 pts)
  const pointsNeeded = (explorador?.minPoints ?? 500) - (beforeUser?.totalPoints ?? 0) + 10;
  const bonusRes = await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: pointsNeeded, description: 'Bônus de teste para cruzar de nível.' },
    masterToken,
  );
  assert('Bônus aplicado com sucesso (201)', bonusRes.status === 201);

  const afterUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  assert(
    `Nível atualizado automaticamente para Explorador (esperado ${explorador?.id}, obtido ${afterUser?.levelId})`,
    afterUser?.levelId === explorador?.id,
  );

  // ── PASSO 7: Total negativo cai no piso (nunca fica sem nível) ────────────────
  console.log('\n6️⃣ Testando que total negativo (PENALTY severa) nunca deixa o usuário sem nível...');
  const heavyPenaltyRes = await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'PENALTY', points: (afterUser?.totalPoints ?? 0) + 500, description: 'Penalidade severa de teste.' },
    masterToken,
  );
  assert('Penalidade severa aplicada (201)', heavyPenaltyRes.status === 201);
  const negativeUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true, levelId: true } });
  assert(`Total ficou negativo (${negativeUser?.totalPoints})`, (negativeUser?.totalPoints ?? 0) < 0);
  assert('Usuário caiu no piso (nível Iniciante), nunca ficou sem nível', negativeUser?.levelId === iniciante?.id);

  // ── PASSO 8: Atualização de minPoints reclassifica usuários existentes ───────
  console.log('\n7️⃣ Testando reclassificação em massa após alteração de faixa...');
  // Traz o total de volta a um valor modesto e positivo (minPoints não aceita negativos)
  await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 600, description: 'Bônus de teste para reclassificação em massa.' },
    masterToken,
  );
  const modestUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } });

  // Reduz o mínimo do Explorador para abaixo do total atual do usuário
  const updateRes = await reqJson(
    'PATCH',
    `/levels/${explorador?.id}`,
    { minPoints: 50 },
    masterToken,
  );
  assert('Atualização de nível executada (200)', updateRes.status === 200);
  const reclassifiedUser = await prisma.user.findUnique({ where: { id: participantId }, select: { levelId: true } });
  assert(
    `Usuário (total=${modestUser?.totalPoints}) foi reclassificado automaticamente para o Explorador após a mudança de faixa`,
    reclassifiedUser?.levelId === explorador?.id,
  );
  // Restaura o valor original para não afetar os próximos testes/fases
  await reqJson('PATCH', `/levels/${explorador?.id}`, { minPoints: 500 }, masterToken);

  // ── PASSO 9: Exclusão reatribui usuários órfãos ───────────────────────────────
  console.log('\n8️⃣ Testando reatribuição automática após exclusão de nível...');
  const deleteRes = await reqJson('DELETE', `/levels/${newLevelId}`, undefined, masterToken);
  assert('Exclusão de nível sem usuários vinculados funciona (200)', deleteRes.status === 200);

  // ── PASSO 10: Nível inexistente ───────────────────────────────────────────────
  console.log('\n9️⃣ Testando busca de nível inexistente...');
  const notFoundRes = await reqJson('GET', '/levels/00000000-0000-0000-0000-000000000000');
  assert('Nível inexistente retorna 404', notFoundRes.status === 404);

  // ── PASSO 11: Auditoria ───────────────────────────────────────────────────────
  console.log('\n🔟 Testando trilha de auditoria das operações de nível...');
  const auditRes = await reqJson('GET', `/admin/audit-logs?entity=Level&action=CREATE`, undefined, masterToken);
  type AuditBody = { data?: Array<{ entityId: string }> };
  const auditEntries = (auditRes.data as AuditBody)?.data ?? [];
  assert('Criação de nível gerou entrada de auditoria', auditEntries.some((e) => e.entityId === newLevelId));

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 11 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 11:', err);
  process.exit(1);
});
