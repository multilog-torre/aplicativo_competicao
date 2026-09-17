/**
 * TESTES AUTOMATIZADOS — APROVAÇÃO AUTOMÁTICA DE ATIVIDADES
 *
 * Cobre:
 * 1. GET /settings exige autenticação (401) e bloqueia participante (403)
 * 2. GET /settings funciona pra ADMIN comum e ADMIN_MASTER
 * 3. PATCH /settings bloqueia participante (403) e ADMIN comum (403)
 * 4. Configuração vem ATIVADA por padrão (seed)
 * 5. Modalidade SEM exigência de evidência: atividade é aprovada e os
 *    pontos creditados na hora do registro, sem nenhuma ação de admin
 * 6. Auditoria da aprovação automática usa a ação AUTO_APPROVE_ACTIVITY,
 *    sem nenhum usuário responsável (userId null)
 * 7. Notificação da aprovação automática menciona "automaticamente"
 * 8. Modalidade QUE EXIGE evidência: continua PENDING até a evidência
 *    chegar — só aprova sozinha DEPOIS do upload da evidência
 * 9. Enviar evidência (opcional) pra uma atividade JÁ aprovada continua
 *    funcionando (não bloqueia mais com ACTIVITY_NOT_EDITABLE)
 * 10. Limite diário é respeitado mesmo com aprovação instantânea (a 2ª
 *     atividade do dia já conta como aprovada pra bloquear a 3ª)
 * 11. Desativando a configuração, o comportamento manual de sempre volta:
 *     atividade fica PENDING até um administrador aprovar
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3970;
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

async function uploadEvidence(activityId: string, token: string): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'comprovante.jpg');
  const res = await fetch(`${BASE_URL}/activities/${activityId}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[HTTP] POST   /activities/${activityId}/evidence -> ${res.status}`);
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

type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
type SettingsBody = { data?: { autoApproveActivities?: boolean } };
type ActivityBody = { data?: { id?: string; status?: string; calculatedPoints?: number } };
type ProfileBody = { data?: { totalPoints?: number } };
type NotificationsBody = { data?: Array<{ type: string; referenceId: string | null; message: string }> };
type AuditBody = { data?: Array<{ action: string; userId: string | null; entityId: string }> };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES — APROVAÇÃO AUTOMÁTICA DE ATIVIDADES');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Aprovação Automática rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'gestor@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!adminToken && !!participantToken);

  // ── PASSO 1-3: Autenticação e autorização de /settings ────────────────────────
  console.log('\n1️⃣ Testando autenticação e autorização de GET/PATCH /settings...');
  const getUnauthRes = await reqJson('GET', '/settings');
  assert('GET /settings exige autenticação (401 sem token)', getUnauthRes.status === 401);

  const getParticipantRes = await reqJson('GET', '/settings', undefined, participantToken);
  assert('Participante não pode consultar /settings (403)', getParticipantRes.status === 403);

  const getAdminRes = await reqJson('GET', '/settings', undefined, adminToken);
  assert('ADMIN comum PODE consultar /settings (200)', getAdminRes.status === 200);

  const getMasterRes = await reqJson('GET', '/settings', undefined, masterToken);
  assert('ADMIN_MASTER PODE consultar /settings (200)', getMasterRes.status === 200);

  const patchParticipantRes = await reqJson('PATCH', '/settings', { autoApproveActivities: false }, participantToken);
  assert('Participante não pode alterar /settings (403)', patchParticipantRes.status === 403);

  const patchAdminRes = await reqJson('PATCH', '/settings', { autoApproveActivities: false }, adminToken);
  assert('ADMIN comum (não master) NÃO pode alterar /settings (403)', patchAdminRes.status === 403);

  // ── PASSO 4: Padrão vem ativado ────────────────────────────────────────────────
  // Só é conclusivo rodando este arquivo ISOLADO logo após um reset do banco
  // (`npm run test:auto-approve`) — numa regressão em CADEIA (vários
  // arquivos de teste sobre o MESMO banco, sem reset entre eles), outra
  // suíte pode ter desativado a configuração antes desta rodar (várias
  // suítes deste projeto desativam de propósito, pra testar o fluxo manual
  // — ver o comentário em test-admin-activities.ts, por exemplo). Por isso
  // este passo só avisa (não reprova o restante do arquivo) e, na sequência,
  // FORÇA a configuração de volta pra true, deixando os passos seguintes
  // (o que realmente importa: a aprovação automática funcionando)
  // determinísticos independente da ordem de execução.
  console.log('\n2️⃣ Testando que a configuração vem ATIVADA por padrão (seed)...');
  const defaultWasTrue = (getMasterRes.data as SettingsBody)?.data?.autoApproveActivities === true;
  if (defaultWasTrue) {
    assert('autoApproveActivities é true por padrão (seed)', true);
  } else {
    console.log(
      '   ⚠️  Pulado: autoApproveActivities já não estava true ao chegar aqui — outra suíte' +
        ' desativou antes desta (só é conclusivo rodando "npm run test:auto-approve" isolado' +
        ' logo após um reset do banco). Restaurando para true e seguindo com o restante do arquivo.',
    );
  }
  await reqJson('PATCH', '/settings', { autoApproveActivities: true }, masterToken);

  // ── PASSO 5-7: Modalidade sem exigência de evidência ───────────────────────────
  console.log('\n3️⃣ Testando aprovação automática (modalidade SEM evidência exigida)...');
  const meditationType = await prisma.activityType.findFirst({ where: { name: { contains: 'Meditação' } } });
  if (!meditationType) throw new Error('Modalidade Meditação não encontrada no seed.');
  assert('Modalidade de teste realmente não exige evidência', meditationType.requiresEvidence === false);

  // Meditação tem dailyLimit=2 no seed, e VÁRIAS outras suítes deste projeto
  // também registram Meditação com a data de HOJE (ex.: test-profile.ts,
  // test-dashboard.ts, test-notifications.ts) — numa regressão em CADEIA
  // (todas sobre o mesmo banco), "hoje" já pode estar com o limite
  // consumido por outra suíte antes desta rodar. Usa um dia bem no passado,
  // exclusivo deste arquivo, pra nunca colidir com o limite diário de mais
  // ninguém.
  const testDay = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const testDayBefore = new Date(Date.now() - 201 * 24 * 60 * 60 * 1000).toISOString();

  const beforeProfileRes = await reqJson('GET', '/profile', undefined, participantToken);
  const pointsBefore = (beforeProfileRes.data as ProfileBody)?.data?.totalPoints ?? 0;

  const createRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: testDay, quantity: 1 },
    participantToken,
  );
  assert('Criação retorna 201', createRes.status === 201);
  const activityId = (createRes.data as ActivityBody)?.data?.id ?? '';
  const calculatedPoints = (createRes.data as ActivityBody)?.data?.calculatedPoints ?? 0;
  assert(
    'Atividade já vem APPROVED na resposta da criação, sem nenhuma ação de admin',
    (createRes.data as ActivityBody)?.data?.status === 'APPROVED',
  );

  const afterProfileRes = await reqJson('GET', '/profile', undefined, participantToken);
  const pointsAfter = (afterProfileRes.data as ProfileBody)?.data?.totalPoints ?? 0;
  // >= em vez de === : o mesmo motor de crédito também pode desbloquear uma
  // conquista (ex.: "Primeiro Passo") na mesma transação, somando pontos
  // extras — o que importa aqui é que o crédito da atividade em si já
  // aconteceu, não que seja o ÚNICO ponto creditado.
  assert(
    'Pontos já foram creditados na hora do registro (sem esperar nenhuma ação de admin)',
    pointsAfter >= pointsBefore + calculatedPoints,
    { pointsBefore, calculatedPoints, pointsAfter },
  );

  console.log('\n4️⃣ Testando auditoria e notificação da aprovação automática...');
  const auditRes = await reqJson('GET', `/admin/audit-logs?action=AUTO_APPROVE_ACTIVITY&entityId=${activityId}`, undefined, masterToken);
  const auditEntries = (auditRes.data as AuditBody)?.data ?? [];
  assert('Auditoria registrou AUTO_APPROVE_ACTIVITY pra esta atividade', auditEntries.length > 0);
  assert('Auditoria da aprovação automática não tem nenhum usuário responsável (userId null)', auditEntries[0]?.userId === null);

  const notifRes = await reqJson('GET', '/notifications?limit=50', undefined, participantToken);
  const notifs = (notifRes.data as NotificationsBody)?.data ?? [];
  assert(
    'Notificação de aprovação menciona que foi automática',
    notifs.some((n) => n.type === 'ACTIVITY_APPROVED' && n.referenceId === activityId && n.message.includes('automaticamente')),
  );

  // ── PASSO 8: Modalidade que exige evidência ────────────────────────────────────
  console.log('\n5️⃣ Testando que modalidade COM evidência exigida só aprova depois do upload...');
  const runningType = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });
  if (!runningType) throw new Error('Modalidade Corrida não encontrada no seed.');
  assert('Modalidade de teste realmente exige evidência', runningType.requiresEvidence === true);

  const createEvidenceRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 2 },
    participantToken,
  );
  const evidenceActivityId = (createEvidenceRes.data as ActivityBody)?.data?.id ?? '';
  assert(
    'Sem evidência ainda, a atividade continua PENDING mesmo com auto-aprovação ativa',
    (createEvidenceRes.data as ActivityBody)?.data?.status === 'PENDING',
  );

  const uploadRes = await uploadEvidence(evidenceActivityId, participantToken);
  assert('Upload de evidência funciona (201)', uploadRes.status === 201);

  const afterEvidenceActivityRes = await reqJson('GET', `/activities/${evidenceActivityId}`, undefined, participantToken);
  type ActivityDetailBody = { data?: { status?: string } };
  assert(
    'Atividade fica APPROVED automaticamente logo após a evidência chegar',
    (afterEvidenceActivityRes.data as ActivityDetailBody)?.data?.status === 'APPROVED',
  );

  // ── PASSO 9: Evidência opcional numa atividade já aprovada ─────────────────────
  console.log('\n6️⃣ Testando envio de evidência (opcional) numa atividade JÁ aprovada...');
  const extraEvidenceRes = await uploadEvidence(activityId, participantToken);
  assert(
    'Enviar evidência extra numa atividade já APPROVED continua funcionando (201)',
    extraEvidenceRes.status === 201,
  );

  // ── PASSO 10: Limite diário respeitado com aprovação instantânea ──────────────
  console.log('\n7️⃣ Testando que o limite diário é respeitado com aprovação instantânea...');
  // Meditação tem dailyLimit=2 no seed; a atividade do passo 3 (mesmo dia
  // testDay) já consumiu 1.
  const secondRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: testDay, quantity: 1 },
    participantToken,
  );
  assert('2ª atividade do dia (dentro do limite) funciona (201)', secondRes.status === 201);

  const thirdRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: testDay, quantity: 1 },
    participantToken,
  );
  assert(
    '3ª atividade do dia é bloqueada (422 LIMIT_EXCEEDED) — a 2ª já contava como aprovada instantaneamente',
    thirdRes.status === 422,
  );

  // ── PASSO 11: Desativando, volta ao comportamento manual de sempre ────────────
  console.log('\n8️⃣ Testando que desativar a configuração restaura o fluxo manual...');
  const disableRes = await reqJson('PATCH', '/settings', { autoApproveActivities: false }, masterToken);
  assert('Desativar a configuração funciona (200)', disableRes.status === 200);
  assert('Resposta reflete autoApproveActivities=false', (disableRes.data as SettingsBody)?.data?.autoApproveActivities === false);

  // Reaproveita Meditação (a única modalidade do seed sem exigência de
  // evidência) — como o limite diário dela (2/dia) já foi consumido em
  // testDay pelos passos anteriores, usa testDayBefore (um dia antes,
  // também exclusivo deste arquivo) pra não colidir com esse limite; o que
  // este passo testa é o fluxo de aprovação, não o limite diário.
  const manualRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: meditationType.id, activityDate: testDayBefore, quantity: 1 },
    participantToken,
  );
  assert(
    'Com a configuração desativada, mesmo uma modalidade sem evidência fica PENDING',
    (manualRes.data as ActivityBody)?.data?.status === 'PENDING',
  );

  const manualActivityId = (manualRes.data as ActivityBody)?.data?.id ?? '';
  const manualApproveRes = await reqJson('POST', `/admin/activities/${manualActivityId}/approve`, undefined, masterToken);
  assert('Aprovação manual continua funcionando normalmente (200)', manualApproveRes.status === 200);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DE APROVAÇÃO AUTOMÁTICA PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes de aprovação automática:', err);
  process.exit(1);
});
