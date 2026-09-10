/**
 * TESTES AUTOMATIZADOS — AUTOCADASTRO E TROCA DE SENHA
 *
 * Cobre:
 * 1. Autocadastro com domínio de e-mail não permitido é bloqueado (422)
 * 2. Autocadastro com domínio permitido funciona (201), status PENDING_APPROVAL
 * 3. E-mail duplicado no autocadastro é bloqueado (409)
 * 4. Login antes da aprovação é bloqueado (401), com mensagem específica
 * 5. ADMIN_MASTER recebeu notificação do novo cadastro pendente
 * 6. ADMIN_MASTER aprova a conta (reaproveitando PATCH /admin/users/:id)
 * 7. Login após aprovação funciona, usando a senha padrão configurada
 * 8. Troca de senha com senha atual incorreta é bloqueada (422)
 * 9. Troca de senha com senha atual correta funciona (200)
 * 10. Login com a senha antiga (padrão) para de funcionar após a troca
 * 11. Login com a nova senha funciona
 * 12. Troca de senha exige autenticação (401 sem token)
 * 13. Valor de gênero inválido é bloqueado (422)
 * 14. Data de nascimento no futuro é bloqueada (422)
 * 15. birthDate e gender informados no autocadastro são persistidos e
 *     retornados em GET /profile
 */

import http from 'http';
import { app } from './app';
import { env } from './config/env';

const TEST_PORT = 3980;
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

type RegisterBody = { data?: { id?: string; status?: string; defaultPassword?: string } };
type LoginBody = { data?: { tokens?: { accessToken?: string } }; error?: { message?: string } };
type NotificationsBody = { data?: Array<{ type: string; referenceId: string | null }> };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES — AUTOCADASTRO E TROCA DE SENHA');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Autocadastro rodando na porta ${TEST_PORT}...\n`);

  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Token do ADMIN_MASTER obtido', !!masterToken);

  // ── PASSO 1: domínio não permitido ────────────────────────────────────────────
  console.log('\n1️⃣ Testando bloqueio de domínio de e-mail não permitido...');
  const wrongDomainRes = await reqJson('POST', '/auth/register', {
    name: 'Usuário Teste',
    email: 'usuario.teste@gmail.com',
  });
  assert('Domínio não permitido é bloqueado (422)', wrongDomainRes.status === 422);

  // ── PASSO 2: cadastro válido ───────────────────────────────────────────────────
  console.log('\n2️⃣ Testando autocadastro com domínio permitido...');
  const newEmail = `funcionario.teste.${Date.now()}@${env.SIGNUP_ALLOWED_EMAIL_DOMAIN}`;
  const registerRes = await reqJson('POST', '/auth/register', {
    name: 'Funcionário de Teste',
    email: newEmail,
    birthDate: '1990-05-14',
    gender: 'FEMALE',
  });
  assert('Autocadastro funciona (201)', registerRes.status === 201);
  const registered = (registerRes.data as RegisterBody)?.data;
  assert('Conta nasce com status PENDING_APPROVAL', registered?.status === 'PENDING_APPROVAL');
  assert('Resposta informa a senha padrão', registered?.defaultPassword === env.DEFAULT_USER_PASSWORD);
  const newUserId = registered?.id ?? '';

  const invalidGenderRes = await reqJson('POST', '/auth/register', {
    name: 'Teste Gênero Inválido',
    email: `outro.${Date.now()}@${env.SIGNUP_ALLOWED_EMAIL_DOMAIN}`,
    gender: 'INVALIDO',
  });
  assert('Valor de gênero inválido é bloqueado (422)', invalidGenderRes.status === 422);

  const futureBirthDateRes = await reqJson('POST', '/auth/register', {
    name: 'Teste Data Futura',
    email: `futuro.${Date.now()}@${env.SIGNUP_ALLOWED_EMAIL_DOMAIN}`,
    birthDate: '2099-01-01',
  });
  assert('Data de nascimento no futuro é bloqueada (422)', futureBirthDateRes.status === 422);

  // ── PASSO 3: e-mail duplicado ──────────────────────────────────────────────────
  const duplicateRes = await reqJson('POST', '/auth/register', { name: 'Outro Nome', email: newEmail });
  assert('E-mail duplicado no autocadastro é bloqueado (409)', duplicateRes.status === 409);

  // ── PASSO 4: login antes da aprovação ──────────────────────────────────────────
  console.log('\n3️⃣ Testando bloqueio de login antes da aprovação...');
  const loginBeforeApprovalRes = await reqJson('POST', '/auth/login', { email: newEmail, password: env.DEFAULT_USER_PASSWORD });
  assert('Login antes da aprovação é bloqueado (401)', loginBeforeApprovalRes.status === 401);
  assert(
    'Mensagem específica de pendência de aprovação',
    ((loginBeforeApprovalRes.data as LoginBody)?.error?.message ?? '').includes('pendente de aprovação'),
  );

  // ── PASSO 5: notificação ao ADMIN_MASTER ───────────────────────────────────────
  console.log('\n4️⃣ Testando notificação ao ADMIN_MASTER...');
  const notificationsRes = await reqJson('GET', '/notifications?limit=50', undefined, masterToken);
  const notifications = (notificationsRes.data as NotificationsBody)?.data ?? [];
  assert(
    'ADMIN_MASTER recebeu notificação NEW_USER_PENDING para o novo cadastro',
    notifications.some((n) => n.type === 'NEW_USER_PENDING' && n.referenceId === newUserId),
  );

  // ── PASSO 6: aprovação pelo admin ──────────────────────────────────────────────
  console.log('\n5️⃣ Testando aprovação da conta pelo ADMIN_MASTER...');
  const approveRes = await reqJson('PATCH', `/admin/users/${newUserId}`, { status: 'ACTIVE' }, masterToken);
  assert('Aprovação (ativação) funciona (200)', approveRes.status === 200);

  // ── PASSO 7: login após aprovação, com a senha padrão ──────────────────────────
  console.log('\n6️⃣ Testando login após aprovação, com a senha padrão...');
  const loginAfterApprovalRes = await reqJson('POST', '/auth/login', { email: newEmail, password: env.DEFAULT_USER_PASSWORD });
  assert('Login após aprovação funciona (200)', loginAfterApprovalRes.status === 200);
  const newUserToken = (loginAfterApprovalRes.data as LoginBody)?.data?.tokens?.accessToken ?? '';

  console.log('\n6️⃣.1 Testando persistência de data de nascimento e gênero...');
  const profileRes = await reqJson('GET', '/profile', undefined, newUserToken);
  type ProfileBody = { data?: { birthDate?: string; gender?: string } };
  const profileData = (profileRes.data as ProfileBody)?.data;
  assert(
    'birthDate informado no autocadastro foi persistido',
    !!profileData?.birthDate && profileData.birthDate.startsWith('1990-05-14'),
  );
  assert('gender informado no autocadastro foi persistido', profileData?.gender === 'FEMALE');

  // ── PASSO 8-9: troca de senha ───────────────────────────────────────────────────
  console.log('\n7️⃣ Testando troca de senha...');
  const wrongCurrentRes = await reqJson(
    'PATCH',
    '/profile/password',
    { currentPassword: 'senhaErrada123', newPassword: 'novaSenha456' },
    newUserToken,
  );
  assert('Troca de senha com senha atual incorreta é bloqueada (422)', wrongCurrentRes.status === 422);

  const changePasswordRes = await reqJson(
    'PATCH',
    '/profile/password',
    { currentPassword: env.DEFAULT_USER_PASSWORD, newPassword: 'novaSenha456' },
    newUserToken,
  );
  assert('Troca de senha com senha atual correta funciona (200)', changePasswordRes.status === 200);

  // ── PASSO 10-11: login reflete a nova senha ────────────────────────────────────
  console.log('\n8️⃣ Testando login com a senha antiga vs. a nova...');
  const loginOldPasswordRes = await reqJson('POST', '/auth/login', { email: newEmail, password: env.DEFAULT_USER_PASSWORD });
  assert('Login com a senha padrão antiga para de funcionar (401)', loginOldPasswordRes.status === 401);

  const loginNewPasswordRes = await reqJson('POST', '/auth/login', { email: newEmail, password: 'novaSenha456' });
  assert('Login com a nova senha funciona (200)', loginNewPasswordRes.status === 200);

  // ── PASSO 12: troca de senha exige autenticação ────────────────────────────────
  console.log('\n9️⃣ Testando exigência de autenticação na troca de senha...');
  const noAuthRes = await reqJson('PATCH', '/profile/password', { currentPassword: 'x', newPassword: 'y123456' });
  assert('Troca de senha sem token retorna 401', noAuthRes.status === 401);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DE AUTOCADASTRO/TROCA DE SENHA PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes de autocadastro:', err);
  process.exit(1);
});
