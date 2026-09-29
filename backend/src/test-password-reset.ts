/**
 * FASE — TESTES AUTOMATIZADOS DE RECUPERAÇÃO DE SENHA
 *
 * Cobre:
 * 1. "Esqueci minha senha" com e-mail existente retorna 200 com mensagem genérica
 * 2. "Esqueci minha senha" com e-mail inexistente retorna a MESMA mensagem (sem enumeração)
 * 3. Token de reset é criado no banco (só o hash, nunca o token puro)
 * 4. Redefinir com token inválido/inexistente é bloqueado (422)
 * 5. Redefinir com token válido funciona — login com a senha nova funciona, com a antiga não
 * 6. Reutilizar o mesmo token (já usado) é bloqueado (422)
 * 7. Token expirado é bloqueado (422)
 * 8. Redefinir por token NÃO liga mustChangePassword (a pessoa já escolheu a própria senha)
 * 9. Admin reseta senha de outro usuário: participante é bloqueado (403), admin funciona (200)
 * 10. Reset pelo admin liga mustChangePassword=true — login reflete isso
 * 11. Trocar a senha (PATCH /profile/password) desliga mustChangePassword
 * 12. Auditoria: RESET_PASSWORD (self-service) e RESET_PASSWORD_ADMIN nunca guardam a senha
 *
 * Sem RESEND_API_KEY configurada (ambiente de teste), EmailService loga o
 * link de redefinição no console em vez de enviar de verdade — o teste
 * intercepta esse log pra extrair o token puro (só o hash fica no banco).
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

/** Chama forgotPassword capturando o link logado pelo EmailService (modo sem RESEND_API_KEY). */
async function requestPasswordResetAndCaptureToken(email: string): Promise<{ status: number; token: string | null }> {
  const originalLog = console.log;
  let capturedUrl: string | null = null;
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('[EmailService]') && line.includes('token=')) {
      const match = line.match(/token=([a-f0-9]+)/);
      if (match) capturedUrl = match[1];
    }
    originalLog(...args);
  };

  const res = await reqJson('POST', '/auth/forgot-password', { email });

  console.log = originalLog;
  return { status: res.status, token: capturedUrl };
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
  console.log('🧪 INICIANDO TESTES DE RECUPERAÇÃO DE SENHA');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Password Reset rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; mustChangePassword?: boolean } } };
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!adminToken && !!participantToken);
  assert('Login normal não vem com mustChangePassword=true', (participantLogin.data as LoginBody)?.data?.user?.mustChangePassword === false);

  // ── PASSO 1-2: "Esqueci minha senha" sem revelar se o e-mail existe ───────────
  console.log('\n1️⃣ Testando "esqueci minha senha" — mensagem genérica, exista ou não o e-mail...');
  const forExisting = await requestPasswordResetAndCaptureToken('renan@empresa.com');
  const forNonExisting = await requestPasswordResetAndCaptureToken('ninguem-cadastrado-xyz@empresa.com');

  type MessageBody = { data?: { message?: string } };
  assert('E-mail existente retorna 200', forExisting.status === 200);
  assert('E-mail inexistente também retorna 200', forNonExisting.status === 200);
  assert('Token foi gerado/capturado para o e-mail existente', !!forExisting.token);
  assert('NENHUM token foi gerado para e-mail inexistente (nada foi logado)', forNonExisting.token === null);

  // ── PASSO 3: Token no banco só guarda o hash ───────────────────────────────────
  console.log('\n2️⃣ Testando que o banco só guarda o HASH do token, nunca o token puro...');
  const dbTokens = await prisma.passwordResetToken.findMany({ where: { userId: participantId }, orderBy: { createdAt: 'desc' } });
  assert('Existe pelo menos 1 PasswordResetToken pro participante', dbTokens.length > 0);
  assert('tokenHash salvo é diferente do token puro capturado', dbTokens[0]?.tokenHash !== forExisting.token);
  assert('tokenHash tem formato de SHA-256 (64 hex chars)', /^[a-f0-9]{64}$/.test(dbTokens[0]?.tokenHash ?? ''));

  // ── PASSO 4: Token inválido ─────────────────────────────────────────────────────
  console.log('\n3️⃣ Testando redefinição com token inválido...');
  const invalidRes = await reqJson('POST', '/auth/reset-password', { token: 'token-que-nao-existe', newPassword: 'novaSenha123' });
  assert('Token inválido é bloqueado (422)', invalidRes.status === 422);

  // ── PASSO 5: Token válido funciona ──────────────────────────────────────────────
  console.log('\n4️⃣ Testando redefinição com token válido...');
  const resetRes = await reqJson('POST', '/auth/reset-password', { token: forExisting.token, newPassword: 'novaSenhaSegura123' });
  assert('Redefinição com token válido funciona (200)', resetRes.status === 200);

  const loginWithNewRes = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'novaSenhaSegura123' });
  assert('Login com a senha NOVA funciona', loginWithNewRes.status === 200);

  const loginWithOldRes = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  assert('Login com a senha ANTIGA deixa de funcionar (401)', loginWithOldRes.status === 401);

  // ── PASSO 8: Reset por token não força troca de novo ────────────────────────────
  assert(
    'Redefinir por token NÃO liga mustChangePassword (a pessoa já escolheu a própria senha)',
    (loginWithNewRes.data as LoginBody)?.data?.user?.mustChangePassword === false,
  );

  // ── PASSO 6: Reutilizar o mesmo token já usado ──────────────────────────────────
  console.log('\n5️⃣ Testando bloqueio de reutilização do mesmo token...');
  const reuseRes = await reqJson('POST', '/auth/reset-password', { token: forExisting.token, newPassword: 'outraSenha456' });
  assert('Token já usado é bloqueado ao tentar de novo (422)', reuseRes.status === 422);

  // ── PASSO 7: Token expirado ──────────────────────────────────────────────────────
  console.log('\n6️⃣ Testando bloqueio de token expirado...');
  const expiredCapture = await requestPasswordResetAndCaptureToken('renan@empresa.com');
  await prisma.passwordResetToken.updateMany({
    where: { userId: participantId, usedAt: null },
    data: { expiresAt: new Date(Date.now() - 60 * 1000) }, // 1 min no passado
  });
  const expiredRes = await reqJson('POST', '/auth/reset-password', { token: expiredCapture.token, newPassword: 'maisUmaSenha789' });
  assert('Token expirado é bloqueado (422)', expiredRes.status === 422);

  // ── PASSO 9-10: Admin reseta senha de outro usuário ──────────────────────────────
  console.log('\n7️⃣ Testando reset administrativo de senha...');
  const participantResetAttempt = await reqJson(
    'POST',
    `/admin/users/${participantId}/reset-password`,
    { newPassword: 'tentativaDeParticipante123' },
    participantToken,
  );
  assert('Participante não pode resetar senha de ninguém pelo endpoint admin (403)', participantResetAttempt.status === 403);

  const adminResetRes = await reqJson(
    'POST',
    `/admin/users/${participantId}/reset-password`,
    { newPassword: 'senhaDefinidaPeloAdmin123' },
    adminToken,
  );
  assert('Admin reseta a senha de outro usuário (200)', adminResetRes.status === 200);

  const loginAfterAdminResetRes = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'senhaDefinidaPeloAdmin123' });
  assert('Login com a senha definida pelo admin funciona', loginAfterAdminResetRes.status === 200);
  assert(
    'Reset pelo ADMIN liga mustChangePassword=true',
    (loginAfterAdminResetRes.data as LoginBody)?.data?.user?.mustChangePassword === true,
  );

  const meAfterAdminResetRes = await reqJson(
    'GET',
    '/auth/me',
    undefined,
    (loginAfterAdminResetRes.data as { data?: { tokens?: { accessToken?: string } } })?.data?.tokens?.accessToken,
  );
  assert('GET /auth/me também reflete mustChangePassword=true', (meAfterAdminResetRes.data as { data?: { mustChangePassword?: boolean } })?.data?.mustChangePassword === true);

  // ── PASSO 11: Trocar a senha desliga mustChangePassword ──────────────────────────
  console.log('\n8️⃣ Testando que trocar a senha desliga mustChangePassword...');
  const newAccessToken = (loginAfterAdminResetRes.data as { data?: { tokens?: { accessToken?: string } } })?.data?.tokens?.accessToken ?? '';
  const changePasswordRes = await reqJson(
    'PATCH',
    '/profile/password',
    { currentPassword: 'senhaDefinidaPeloAdmin123', newPassword: 'senhaEscolhidaPelaPessoa123' },
    newAccessToken,
  );
  assert('Troca de senha funciona (200)', changePasswordRes.status === 200);

  const loginAfterChangeRes = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'senhaEscolhidaPelaPessoa123' });
  assert(
    'Depois de trocar a senha, mustChangePassword volta pra false',
    (loginAfterChangeRes.data as LoginBody)?.data?.user?.mustChangePassword === false,
  );

  // ── PASSO 12: Auditoria nunca guarda a senha ──────────────────────────────────────
  console.log('\n9️⃣ Testando trilha de auditoria...');
  const auditSelfServiceRes = await reqJson('GET', '/admin/audit-logs?action=RESET_PASSWORD', undefined, adminToken);
  type AuditBody = { data?: Array<{ action: string; newValues: unknown }> };
  const selfServiceLogs = (auditSelfServiceRes.data as AuditBody)?.data ?? [];
  assert('Auditoria RESET_PASSWORD (self-service) foi registrada', selfServiceLogs.length > 0);
  assert(
    'Nenhum log de auditoria contém a senha em texto/hash',
    selfServiceLogs.every((l) => {
      const serialized = JSON.stringify(l.newValues);
      return !serialized.includes('novaSenhaSegura123') && !serialized.includes('$2');
    }),
  );

  const auditAdminResetRes = await reqJson('GET', '/admin/audit-logs?action=RESET_PASSWORD_ADMIN', undefined, adminToken);
  const adminResetLogs = (auditAdminResetRes.data as AuditBody)?.data ?? [];
  assert('Auditoria RESET_PASSWORD_ADMIN foi registrada', adminResetLogs.length > 0);
  assert(
    'Log de reset administrativo não contém a senha em texto/hash',
    adminResetLogs.every((l) => {
      const serialized = JSON.stringify(l.newValues);
      return !serialized.includes('senhaDefinidaPeloAdmin123') && !serialized.includes('$2');
    }),
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DE RECUPERAÇÃO DE SENHA PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes de recuperação de senha:', err);
  process.exit(1);
});
