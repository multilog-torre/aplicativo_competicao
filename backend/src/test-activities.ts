/**
 * FASE 6 — TESTES AUTOMATIZADOS DO REGISTRO DE ATIVIDADES
 *
 * Cobre:
 * 1. Registro de atividade com sucesso (status inicial PENDING)
 * 2. Pontos calculados no registro, mas SEM crédito no ledger (calculatedPoints ≠ points_transaction)
 * 3. Total de pontos do usuário não muda ao registrar (pontos só são creditados na aprovação — Fase 8)
 * 4. Modalidade inexistente é rejeitada (404)
 * 5. Modalidade inativa é rejeitada (422)
 * 6. Data no futuro é rejeitada (422 — validação Zod)
 * 7. Quantidade inválida (zero/negativa) é rejeitada (422)
 * 8. Listagem: participante vê apenas as próprias atividades
 * 9. Listagem: admin pode filtrar por userId de outro usuário
 * 10. Detalhe: participante não pode ver atividade de outro usuário (403)
 * 11. Detalhe: admin pode ver atividade de qualquer usuário
 * 12. Atividade inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3996;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

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
  console.log('🧪 INICIANDO TESTES DA FASE 6 — REGISTRO DE ATIVIDADES');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Atividades rodando na porta ${TEST_PORT}...\n`);

  // ── PASSO 0: Tokens ──────────────────────────────────────────────────────────
  console.log('0️⃣ Obtendo tokens de autenticação...');
  const adminLogin = await req('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await req('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  const otherParticipantLogin = await req('POST', '/auth/login', {
    email: 'beatriz@empresa.com',
    password: 'user123',
  });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; totalPoints?: number } } };
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const otherToken = (otherParticipantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  const totalBeforeRegister = (participantLogin.data as LoginBody)?.data?.user?.totalPoints ?? 0;
  assert('Tokens obtidos com sucesso', !!adminToken && !!participantToken && !!otherToken);

  // Este arquivo testa o registro de atividades, que nasce PENDING antes de
  // qualquer avaliação — desativa a aprovação automática (ativada por
  // padrão desde a Fase de Aprovação Automática) pra preservar esse
  // comportamento. `adminToken` aqui é admin@empresa.com, que é ADMIN_MASTER.
  await req('PATCH', '/settings', { autoApproveActivities: false }, adminToken);

  const activityType = await prisma.activityType.findFirst({
    where: { name: { contains: 'Corrida' }, status: 'ACTIVE' },
  });
  if (!activityType) throw new Error('Modalidade Corrida não encontrada no seed — abortando testes.');

  // ── PASSO 1: Registro de atividade com sucesso ───────────────────────────────
  console.log('\n1️⃣ Testando registro de atividade válida...');
  const createRes = await req(
    'POST',
    '/activities',
    {
      activityTypeId: activityType.id,
      activityDate: new Date().toISOString(),
      quantity: 5,
      description: 'Corrida matinal no parque.',
    },
    participantToken,
  );
  assert('Atividade criada com sucesso (HTTP 201)', createRes.status === 201);
  type ActivityBody = { data?: { id?: string; status?: string; calculatedPoints?: number; userId?: string } };
  const createdActivity = (createRes.data as ActivityBody)?.data;
  assert('Status inicial é PENDING', createdActivity?.status === 'PENDING');
  assert(
    `Pontos calculados corretamente (esperado 50, obtido ${createdActivity?.calculatedPoints})`,
    createdActivity?.calculatedPoints === 50,
  );
  const activityId = createdActivity?.id ?? '';

  // ── PASSO 2 e 3: Nenhum crédito de pontos ainda ──────────────────────────────
  console.log('\n2️⃣ Verificando que NENHUM ponto foi creditado ao registrar (regra da Fase 6)...');
  const txCountForActivity = await prisma.pointsTransaction.count({ where: { activityId } });
  assert('Nenhuma points_transaction foi criada para a atividade PENDING', txCountForActivity === 0);

  const userAfterRegister = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } });
  assert(
    `Total de pontos do usuário não mudou (antes: ${totalBeforeRegister}, depois: ${userAfterRegister?.totalPoints})`,
    userAfterRegister?.totalPoints === totalBeforeRegister,
  );

  // ── PASSO 4: Modalidade inexistente ──────────────────────────────────────────
  console.log('\n3️⃣ Testando rejeição de modalidade inexistente...');
  const invalidTypeRes = await req(
    'POST',
    '/activities',
    { activityTypeId: '00000000-0000-0000-0000-000000000000', activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  assert('Modalidade inexistente retorna 404', invalidTypeRes.status === 404);

  // ── PASSO 5: Modalidade inativa ───────────────────────────────────────────────
  console.log('\n4️⃣ Testando rejeição de modalidade inativa...');
  const inactiveType = await prisma.activityType.create({
    data: {
      name: `Modalidade Inativa Teste ${Date.now()}`,
      scoringType: 'FIXED',
      basePoints: 10,
      status: 'INACTIVE',
    },
  });
  const inactiveRes = await req(
    'POST',
    '/activities',
    { activityTypeId: inactiveType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  assert('Modalidade inativa retorna 422', inactiveRes.status === 422);

  // ── PASSO 6: Data no futuro ────────────────────────────────────────────────────
  console.log('\n5️⃣ Testando rejeição de data no futuro...');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  const futureDateRes = await req(
    'POST',
    '/activities',
    { activityTypeId: activityType.id, activityDate: futureDate.toISOString(), quantity: 1 },
    participantToken,
  );
  assert('Data no futuro é rejeitada (422)', futureDateRes.status === 422);

  // ── PASSO 7: Quantidade inválida ───────────────────────────────────────────────
  console.log('\n6️⃣ Testando rejeição de quantidade inválida...');
  const zeroQtyRes = await req(
    'POST',
    '/activities',
    { activityTypeId: activityType.id, activityDate: new Date().toISOString(), quantity: 0 },
    participantToken,
  );
  assert('Quantidade zero é rejeitada (422)', zeroQtyRes.status === 422);

  const negativeQtyRes = await req(
    'POST',
    '/activities',
    { activityTypeId: activityType.id, activityDate: new Date().toISOString(), quantity: -3 },
    participantToken,
  );
  assert('Quantidade negativa é rejeitada (422)', negativeQtyRes.status === 422);

  // ── PASSO 8: Listagem — participante só vê as próprias ────────────────────────
  console.log('\n7️⃣ Testando isolamento de listagem entre participantes...');
  await req(
    'POST',
    '/activities',
    { activityTypeId: activityType.id, activityDate: new Date().toISOString(), quantity: 2 },
    otherToken,
  );
  const ownListRes = await req('GET', '/activities', undefined, participantToken);
  type ListBody = { data?: Array<{ id: string; userId: string }> };
  const ownList = (ownListRes.data as ListBody)?.data ?? [];
  assert('Listagem retorna HTTP 200', ownListRes.status === 200);
  assert(
    'Participante só vê as próprias atividades na listagem',
    ownList.every((a) => a.userId === participantId) && ownList.length > 0,
  );

  // ── PASSO 9: Admin filtra por userId de outro usuário ─────────────────────────
  console.log('\n8️⃣ Testando filtro administrativo por userId...');
  const adminListRes = await req('GET', `/activities?userId=${participantId}`, undefined, adminToken);
  const adminList = (adminListRes.data as ListBody)?.data ?? [];
  assert('Admin pode filtrar por userId (HTTP 200)', adminListRes.status === 200);
  assert(
    'Resultado do filtro contém apenas atividades do usuário informado',
    adminList.every((a) => a.userId === participantId) && adminList.length > 0,
  );

  // ── PASSO 10: Participante não pode ver atividade de outro ────────────────────
  console.log('\n9️⃣ Testando bloqueio de acesso cruzado entre participantes...');
  const crossAccessRes = await req('GET', `/activities/${activityId}`, undefined, otherToken);
  assert('Outro participante não pode ver a atividade (403)', crossAccessRes.status === 403);

  // ── PASSO 11: Admin pode ver qualquer atividade ────────────────────────────────
  console.log('\n🔟 Testando acesso administrativo irrestrito ao detalhe...');
  const adminDetailRes = await req('GET', `/activities/${activityId}`, undefined, adminToken);
  assert('Admin pode ver detalhe de qualquer atividade (200)', adminDetailRes.status === 200);

  // ── PASSO 12: Atividade inexistente ───────────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando atividade inexistente...');
  const notFoundRes = await req(
    'GET',
    '/activities/00000000-0000-0000-0000-000000000000',
    undefined,
    participantToken,
  );
  assert('Atividade inexistente retorna 404', notFoundRes.status === 404);

  // ── Limpeza ────────────────────────────────────────────────────────────────────
  await prisma.activityType.delete({ where: { id: inactiveType.id } });

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 6 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 6:', err);
  process.exit(1);
});
