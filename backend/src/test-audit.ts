/**
 * FASE 9 — TESTES AUTOMATIZADOS DA TRILHA DE AUDITORIA
 *
 * Cobre:
 * 1. Participante não acessa /admin/audit-logs (403)
 * 2. ADMIN comum (não master) não acessa /admin/audit-logs (403) — segregação de funções
 * 3. ADMIN_MASTER lista a trilha de auditoria (200, paginação presente)
 * 4. Login gera entrada de auditoria (action=LOGIN) consultável
 * 5. Aprovação de atividade gera entrada APPROVE_ACTIVITY com entityId correto
 * 6. Entrada de aprovação identifica quem, o quê, quando, valor anterior e novo
 * 7. Rejeição de atividade gera entrada REJECT_ACTIVITY com o motivo no newValues
 * 8. Lançamento manual (BONUS) gera entrada MANUAL_POINTS
 * 9. Reversão de transação gera entrada REVERSAL
 * 10. Alteração de modalidade gera entrada UPDATE com oldValues e newValues distintos
 * 11. Filtro por entity retorna apenas registros daquela entidade
 * 12. Filtro por action retorna apenas registros daquela ação
 * 13. GET /admin/audit-logs/:id retorna o detalhe com valores desserializados (objeto, não string)
 * 14. Registro de auditoria inexistente retorna 404
 * 15. Filtro por período (dateFrom no futuro) não retorna nenhum registro
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3993;
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
  console.log('🧪 INICIANDO TESTES DA FASE 9 — AUDITORIA');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Auditoria rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'gestor@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!adminToken && !!participantToken);

  // ── PASSO 1-2: Bloqueio de acesso ─────────────────────────────────────────────
  console.log('\n1️⃣ Testando segregação de funções no acesso à auditoria...');
  const participantBlockedRes = await reqJson('GET', '/admin/audit-logs', undefined, participantToken);
  assert('Participante não acessa /admin/audit-logs (403)', participantBlockedRes.status === 403);

  const adminBlockedRes = await reqJson('GET', '/admin/audit-logs', undefined, adminToken);
  assert('ADMIN comum não acessa /admin/audit-logs (403) — apenas ADMIN_MASTER audita', adminBlockedRes.status === 403);

  // ── PASSO 3: ADMIN_MASTER lista a auditoria ───────────────────────────────────
  console.log('\n2️⃣ Testando listagem por ADMIN_MASTER...');
  const listRes = await reqJson('GET', '/admin/audit-logs', undefined, masterToken);
  type LogItem = {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    userId: string | null;
    oldValues: unknown;
    newValues: unknown;
    createdAt: string;
  };
  type ListBody = { data?: LogItem[]; meta?: { total?: number } };
  assert('ADMIN_MASTER lista a auditoria (200)', listRes.status === 200);
  const initialTotal = (listRes.data as ListBody)?.meta?.total ?? 0;
  assert('Paginação com total presente', initialTotal >= 0);

  // ── PASSO 4: Login gera auditoria ─────────────────────────────────────────────
  console.log('\n3️⃣ Verificando que o LOGIN já realizado gerou entrada de auditoria...');
  const loginLogsRes = await reqJson('GET', `/admin/audit-logs?action=LOGIN&userId=${participantId}`, undefined, masterToken);
  const loginLogs = (loginLogsRes.data as ListBody)?.data ?? [];
  assert('Existe ao menos 1 entrada LOGIN para o participante', loginLogs.length >= 1);

  // ── PASSO 5-6: Aprovação gera auditoria completa ──────────────────────────────
  console.log('\n4️⃣ Testando rastreabilidade de aprovação de atividade...');
  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  if (!meditationType) throw new Error('Modalidade Meditação não encontrada no seed.');

  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string } };
  const activityId = (createRes.data as ActivityBody)?.data?.id ?? '';

  const approveRes = await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, masterToken);
  assert('Aprovação de teste executada com sucesso (200)', approveRes.status === 200);

  const approveLogsRes = await reqJson(
    'GET',
    `/admin/audit-logs?action=APPROVE_ACTIVITY&entityId=${activityId}`,
    undefined,
    masterToken,
  );
  const approveLogs = (approveLogsRes.data as ListBody)?.data ?? [];
  assert('Entrada APPROVE_ACTIVITY encontrada para a atividade aprovada', approveLogs.length === 1);
  const approveLog = approveLogs[0];
  assert('Registro identifica QUEM aprovou (userId = admin master)', !!approveLog?.userId);
  assert('Registro identifica O QUÊ (entity=UserActivity)', approveLog?.entity === 'UserActivity');
  assert('Registro identifica QUAL registro (entityId = activityId)', approveLog?.entityId === activityId);
  assert('Registro identifica QUANDO (createdAt presente)', !!approveLog?.createdAt);
  assert(
    'Registro identifica o VALOR ANTERIOR (oldValues.status = PENDING)',
    (approveLog?.oldValues as { status?: string })?.status === 'PENDING',
  );
  assert(
    'Registro identifica o NOVO VALOR (newValues.status = APPROVED, com pontos e transactionId)',
    (approveLog?.newValues as { status?: string; pointsCredited?: number; transactionId?: string })?.status ===
      'APPROVED' &&
      typeof (approveLog?.newValues as { pointsCredited?: number })?.pointsCredited === 'number' &&
      !!(approveLog?.newValues as { transactionId?: string })?.transactionId,
  );

  // ── PASSO 7: Rejeição gera auditoria com motivo ───────────────────────────────
  console.log('\n5️⃣ Testando rastreabilidade de rejeição...');
  const createRejectRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  const rejectActivityId = (createRejectRes.data as ActivityBody)?.data?.id ?? '';
  const rejectReason = 'Comprovação inconsistente com o horário relatado.';
  await reqJson('POST', `/admin/activities/${rejectActivityId}/reject`, { reason: rejectReason }, masterToken);

  const rejectLogsRes = await reqJson(
    'GET',
    `/admin/audit-logs?action=REJECT_ACTIVITY&entityId=${rejectActivityId}`,
    undefined,
    masterToken,
  );
  const rejectLog = ((rejectLogsRes.data as ListBody)?.data ?? [])[0];
  assert('Entrada REJECT_ACTIVITY contém o motivo informado', (rejectLog?.newValues as { reason?: string })?.reason === rejectReason);

  // ── PASSO 8: Lançamento manual gera auditoria ─────────────────────────────────
  console.log('\n6️⃣ Testando rastreabilidade de lançamento manual de pontos...');
  const manualRes = await reqJson(
    'POST',
    '/scoring/manual',
    { userId: participantId, transactionType: 'BONUS', points: 25, description: 'Bônus de teste de auditoria.' },
    masterToken,
  );
  type ManualBody = { data?: { transaction?: { id?: string } } };
  const manualTransactionId = (manualRes.data as ManualBody)?.data?.transaction?.id ?? '';

  const manualLogsRes = await reqJson(
    'GET',
    `/admin/audit-logs?action=MANUAL_POINTS&entityId=${manualTransactionId}`,
    undefined,
    masterToken,
  );
  assert('Entrada MANUAL_POINTS encontrada para a transação criada', ((manualLogsRes.data as ListBody)?.data ?? []).length === 1);

  // ── PASSO 9: Reversão gera auditoria ──────────────────────────────────────────
  console.log('\n7️⃣ Testando rastreabilidade de reversão de transação...');
  const reversalRes = await reqJson(
    'POST',
    `/scoring/transactions/${manualTransactionId}/reverse`,
    { reason: 'Bônus concedido em duplicidade.' },
    masterToken,
  );
  assert('Reversão executada com sucesso (200)', reversalRes.status === 200);
  const reversalLogsRes = await reqJson('GET', '/admin/audit-logs?action=REVERSAL', undefined, masterToken);
  assert('Ao menos 1 entrada REVERSAL na auditoria', ((reversalLogsRes.data as ListBody)?.data ?? []).length >= 1);

  // ── PASSO 10: Alteração de modalidade gera auditoria ──────────────────────────
  console.log('\n8️⃣ Testando rastreabilidade de alteração de modalidade...');
  const updateModalityRes = await reqJson(
    'PATCH',
    `/activity-types/${meditationType.id}`,
    { description: `Descrição atualizada em teste de auditoria - ${Date.now()}` },
    masterToken,
  );
  assert('Atualização de modalidade executada (200)', updateModalityRes.status === 200);
  const modalityLogsRes = await reqJson(
    'GET',
    `/admin/audit-logs?action=UPDATE&entity=ActivityType&entityId=${meditationType.id}`,
    undefined,
    masterToken,
  );
  const modalityLogs = (modalityLogsRes.data as ListBody)?.data ?? [];
  assert('Entrada UPDATE de ActivityType encontrada', modalityLogs.length >= 1);
  const latestModalityLog = modalityLogs[0];
  assert(
    'oldValues e newValues são diferentes entre si',
    JSON.stringify(latestModalityLog?.oldValues) !== JSON.stringify(latestModalityLog?.newValues),
  );

  // ── PASSO 11-12: Filtros ──────────────────────────────────────────────────────
  console.log('\n9️⃣ Testando filtros de entidade e ação...');
  const entityFilterRes = await reqJson('GET', '/admin/audit-logs?entity=UserActivity', undefined, masterToken);
  const entityFilterLogs = (entityFilterRes.data as ListBody)?.data ?? [];
  assert(
    'Filtro por entity=UserActivity retorna apenas essa entidade',
    entityFilterLogs.length > 0 && entityFilterLogs.every((l) => l.entity === 'UserActivity'),
  );

  const actionFilterRes = await reqJson('GET', '/admin/audit-logs?action=LOGIN', undefined, masterToken);
  const actionFilterLogs = (actionFilterRes.data as ListBody)?.data ?? [];
  assert(
    'Filtro por action=LOGIN retorna apenas essa ação',
    actionFilterLogs.length > 0 && actionFilterLogs.every((l) => l.action === 'LOGIN'),
  );

  // ── PASSO 13-14: Detalhe por ID ────────────────────────────────────────────────
  console.log('\n🔟 Testando detalhe individual do registro de auditoria...');
  const detailRes = await reqJson('GET', `/admin/audit-logs/${approveLog.id}`, undefined, masterToken);
  type DetailBody = { data?: LogItem };
  assert('Detalhe retorna 200', detailRes.status === 200);
  assert(
    'Valores do detalhe já vêm desserializados (objeto, não string JSON)',
    typeof (detailRes.data as DetailBody)?.data?.newValues === 'object',
  );

  const notFoundRes = await reqJson(
    'GET',
    '/admin/audit-logs/00000000-0000-0000-0000-000000000000',
    undefined,
    masterToken,
  );
  assert('Registro inexistente retorna 404', notFoundRes.status === 404);

  // ── PASSO 15: Filtro por período sem correspondência ──────────────────────────
  console.log('\n1️⃣1️⃣ Testando filtro por período (data futura sem correspondência)...');
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const futureFilterRes = await reqJson(
    'GET',
    `/admin/audit-logs?dateFrom=${futureDate.toISOString()}`,
    undefined,
    masterToken,
  );
  const futureLogs = (futureFilterRes.data as ListBody)?.data ?? [];
  assert('Filtro com dateFrom no futuro não retorna registros', futureLogs.length === 0);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 9 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 9:', err);
  process.exit(1);
});
