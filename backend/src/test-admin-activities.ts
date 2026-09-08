/**
 * FASE 8 — TESTES AUTOMATIZADOS DA VALIDAÇÃO ADMINISTRATIVA
 *
 * Cobre:
 * 1. Participante não acessa a fila de pendentes (403)
 * 2. Admin lista a fila de pendentes corretamente
 * 3. Aprovação de atividade sem evidência exigida credita pontos corretamente (transação atômica)
 * 4. calculatedPoints da atividade == points da points_transaction criada
 * 5. users.total_points é incrementado exatamente pelos pontos da atividade aprovada
 * 6. Atividade aprovada muda para status APPROVED com validatedBy/validatedAt preenchidos
 * 7. Aprovação de atividade já avaliada é bloqueada (422)
 * 8. Aprovação de atividade que exige evidência SEM evidência anexada é bloqueada (422)
 * 9. Aprovação da mesma atividade após anexar evidência funciona
 * 10. Rejeição exige motivo (422 quando ausente/curto)
 * 11. Rejeição funciona e NÃO credita pontos
 * 12. Atividade rejeitada muda para status REJECTED com rejectionReason preenchido
 * 13. Rejeição de atividade já avaliada é bloqueada (422)
 * 14. Participante não pode aprovar/rejeitar (403)
 * 15. Aprovação de atividade inexistente retorna 404
 * 16. Integridade do ledger: soma das transações == total_points do usuário
 *
 * ⚠️ Este teste depende de limites diários configurados nas modalidades (Fase 4/5)
 * e por isso assume um banco recém-semeado. Execute `npm run db:setup:sqlite`
 * antes de rodar este script — o mesmo padrão já usado pelos demais test:*.
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3994;
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

async function reqUpload(path: string, token: string): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'comprovante.jpg');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[UPLOAD] POST ${path} -> ${res.status}`);
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
  console.log('🧪 INICIANDO TESTES DA FASE 8 — VALIDAÇÃO ADMINISTRATIVA');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Admin/Atividades rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; totalPoints?: number } } };
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!adminToken && !!participantToken);

  // Modalidade que NÃO exige evidência (Meditação, do seed) — simplifica o cenário feliz
  const noEvidenceType = await prisma.activityType.findFirst({
    where: { name: { contains: 'Meditação' }, requiresEvidence: false },
  });
  // Modalidade que EXIGE evidência (Corrida, do seed)
  const evidenceRequiredType = await prisma.activityType.findFirst({
    where: { name: { contains: 'Corrida' }, requiresEvidence: true },
  });
  if (!noEvidenceType || !evidenceRequiredType) {
    throw new Error('Modalidades esperadas do seed não encontradas — abortando testes.');
  }

  // ── PASSO 1: Participante não acessa a fila de pendentes ──────────────────────
  console.log('\n1️⃣ Testando bloqueio de participante na fila administrativa...');
  const forbiddenListRes = await reqJson('GET', '/admin/activities/pending', undefined, participantToken);
  assert('Participante não acessa /admin/activities/pending (403)', forbiddenListRes.status === 403);

  // ── PASSO 2: Cria atividade sem exigência de evidência e lista como admin ─────
  console.log('\n2️⃣ Registrando atividade e testando listagem administrativa...');
  const totalBefore = (
    (await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' })).data as LoginBody
  )?.data?.user?.totalPoints ?? 0;

  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: noEvidenceType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string; calculatedPoints?: number } };
  const activity = (createRes.data as ActivityBody)?.data;
  const activityId = activity?.id ?? '';
  assert('Atividade de teste criada (201)', createRes.status === 201 && !!activityId);

  const pendingListRes = await reqJson('GET', '/admin/activities/pending', undefined, adminToken);
  type PendingListBody = { data?: Array<{ id: string }> };
  const pendingIds = ((pendingListRes.data as PendingListBody)?.data ?? []).map((a) => a.id);
  assert('Admin lista a fila de pendentes (200)', pendingListRes.status === 200);
  assert('Atividade criada aparece na fila de pendentes', pendingIds.includes(activityId));

  // ── PASSO 3-6: Aprovação com sucesso ────────────────────────────────────────────
  console.log('\n3️⃣ Testando aprovação com crédito de pontos (transação atômica)...');
  const approveRes = await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, adminToken);
  assert('Aprovação retorna 200', approveRes.status === 200);

  type ApproveBody = {
    data?: {
      activity?: { status?: string; validatedBy?: string; validatedAt?: string | null };
      transaction?: { id?: string; points?: number; transactionType?: string };
      newTotalPoints?: number;
    };
  };
  const approveData = (approveRes.data as ApproveBody)?.data;
  assert('Atividade aprovada tem status APPROVED', approveData?.activity?.status === 'APPROVED');
  assert('validatedBy e validatedAt preenchidos', !!approveData?.activity?.validatedBy && !!approveData?.activity?.validatedAt);
  assert('Transação criada tem tipo ACTIVITY', approveData?.transaction?.transactionType === 'ACTIVITY');
  assert(
    `Pontos da transação == calculatedPoints da atividade (${activity?.calculatedPoints})`,
    approveData?.transaction?.points === activity?.calculatedPoints,
  );
  assert(
    `Total do usuário incrementado corretamente (antes: ${totalBefore}, esperado: ${totalBefore + (activity?.calculatedPoints ?? 0)}, obtido: ${approveData?.newTotalPoints})`,
    approveData?.newTotalPoints === totalBefore + (activity?.calculatedPoints ?? 0),
  );

  const dbActivity = await prisma.userActivity.findUnique({ where: { id: activityId } });
  const dbTransaction = await prisma.pointsTransaction.findFirst({ where: { activityId } });
  assert('Persistido no banco: status APPROVED', dbActivity?.status === 'APPROVED');
  assert('Persistido no banco: points_transaction criada com activityId vinculado', !!dbTransaction);

  // ── PASSO 7: Aprovar novamente é bloqueado ────────────────────────────────────
  console.log('\n4️⃣ Testando bloqueio de dupla aprovação...');
  const doubleApproveRes = await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, adminToken);
  assert('Segunda aprovação bloqueada (422)', doubleApproveRes.status === 422);

  // ── PASSO 8-9: Exigência de evidência ─────────────────────────────────────────
  console.log('\n5️⃣ Testando bloqueio de aprovação sem evidência exigida...');
  const runningActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: evidenceRequiredType.id, activityDate: new Date().toISOString(), quantity: 5 },
    participantToken,
  );
  const runningActivityId = (runningActivityRes.data as ActivityBody)?.data?.id ?? '';

  const approveWithoutEvidenceRes = await reqJson(
    'POST',
    `/admin/activities/${runningActivityId}/approve`,
    undefined,
    adminToken,
  );
  assert('Aprovação sem evidência exigida é bloqueada (422)', approveWithoutEvidenceRes.status === 422);

  console.log('\n6️⃣ Anexando evidência e testando aprovação novamente...');
  await reqUpload(`/activities/${runningActivityId}/evidence`, participantToken);
  const approveWithEvidenceRes = await reqJson(
    'POST',
    `/admin/activities/${runningActivityId}/approve`,
    undefined,
    adminToken,
  );
  assert('Aprovação com evidência anexada funciona (200)', approveWithEvidenceRes.status === 200);

  // ── PASSO 10-13: Rejeição ─────────────────────────────────────────────────────
  console.log('\n7️⃣ Testando rejeição (motivo obrigatório)...');
  // Usa a modalidade de limite alto (Corrida) para não esbarrar no dailyLimit=2
  // da Meditação ao rodar esta suíte múltiplas vezes no mesmo dia sem reset do banco.
  const anotherActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: evidenceRequiredType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  const anotherActivityId = (anotherActivityRes.data as ActivityBody)?.data?.id ?? '';

  const rejectWithoutReasonRes = await reqJson(
    'POST',
    `/admin/activities/${anotherActivityId}/reject`,
    { reason: 'no' },
    adminToken,
  );
  assert('Rejeição sem motivo válido é bloqueada (422)', rejectWithoutReasonRes.status === 422);

  const totalBeforeReject = (await prisma.user.findUnique({ where: { id: participantId } }))?.totalPoints ?? 0;
  const rejectRes = await reqJson(
    'POST',
    `/admin/activities/${anotherActivityId}/reject`,
    { reason: 'Evidência não corresponde à atividade relatada.' },
    adminToken,
  );
  assert('Rejeição com motivo válido funciona (200)', rejectRes.status === 200);

  const dbRejected = await prisma.userActivity.findUnique({ where: { id: anotherActivityId } });
  assert('Atividade rejeitada tem status REJECTED', dbRejected?.status === 'REJECTED');
  assert('rejectionReason foi persistido', !!dbRejected?.rejectionReason);

  const totalAfterReject = (await prisma.user.findUnique({ where: { id: participantId } }))?.totalPoints ?? 0;
  assert('Rejeição NÃO credita pontos (total inalterado)', totalAfterReject === totalBeforeReject);

  console.log('\n8️⃣ Testando bloqueio de reavaliação de atividade já rejeitada...');
  const doubleRejectRes = await reqJson(
    'POST',
    `/admin/activities/${anotherActivityId}/reject`,
    { reason: 'Tentativa de rejeição duplicada.' },
    adminToken,
  );
  assert('Rejeição de atividade já avaliada é bloqueada (422)', doubleRejectRes.status === 422);

  // ── PASSO 14: Participante não pode aprovar/rejeitar ──────────────────────────
  console.log('\n9️⃣ Testando bloqueio de aprovação/rejeição por participante...');
  const yetAnotherActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: evidenceRequiredType.id, activityDate: new Date().toISOString(), quantity: 1 },
    participantToken,
  );
  const yetAnotherId = (yetAnotherActivityRes.data as ActivityBody)?.data?.id ?? '';
  const participantApproveRes = await reqJson(
    'POST',
    `/admin/activities/${yetAnotherId}/approve`,
    undefined,
    participantToken,
  );
  assert('Participante não pode aprovar atividades (403)', participantApproveRes.status === 403);

  // ── PASSO 15: Atividade inexistente ───────────────────────────────────────────
  console.log('\n🔟 Testando aprovação de atividade inexistente...');
  const notFoundRes = await reqJson(
    'POST',
    '/admin/activities/00000000-0000-0000-0000-000000000000/approve',
    undefined,
    adminToken,
  );
  assert('Atividade inexistente retorna 404', notFoundRes.status === 404);

  // ── PASSO 16: Integridade final do ledger ─────────────────────────────────────
  console.log('\n1️⃣1️⃣ Verificando integridade final do ledger...');
  const finalUser = await prisma.user.findUnique({ where: { id: participantId }, select: { totalPoints: true } });
  const allTx = await prisma.pointsTransaction.findMany({ where: { userId: participantId }, select: { points: true } });
  const ledgerSum = allTx.reduce((acc, t) => acc + t.points, 0);
  assert(
    `Total do usuário (${finalUser?.totalPoints}) == soma do ledger (${ledgerSum})`,
    finalUser?.totalPoints === ledgerSum,
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 8 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 8:', err);
  process.exit(1);
});
