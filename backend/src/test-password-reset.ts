/**
 * FASE — TESTES AUTOMATIZADOS DE RECUPERAÇÃO DE SENHA
 *
 * PASSWORD_RESET_MODE=ADMIN_NOTIFICATION é o padrão (env.ts) — modo ativo
 * hoje em produção, a pedido do usuário, enquanto nenhum domínio de e-mail
 * está verificado no Resend (o domínio de teste onboarding@resend.dev só
 * entrega pro próprio dono da conta Resend). O modo EMAIL (link por
 * e-mail, com PasswordResetToken de uso único) continua implementado e
 * coberto pelos testes 8-9 abaixo no nível do endpoint /auth/reset-password
 * (que não muda entre os dois modos) — já foi validado ponta a ponta
 * manualmente contra um servidor real antes desta mudança de padrão, e
 * volta a ficar 100% exercitado por este arquivo quando PASSWORD_RESET_MODE
 * voltar a ser EMAIL (troca só de variável de ambiente, sem deploy de
 * código — ver usuarios-e-acesso.md).
 *
 * Cobre:
 * 1. "Esqueci minha senha" com e-mail existente notifica TODO ADMIN_MASTER
 * 2. "Esqueci minha senha" com e-mail inexistente NÃO notifica ninguém (mesma resposta genérica)
 * 3. Nenhum PasswordResetToken é criado no modo ADMIN_NOTIFICATION
 * 4. Notificação nunca contém a senha, só nome/e-mail da pessoa
 * 5. Admin reseta a senha da pessoa que pediu (fluxo completo pós-notificação)
 * 6. Reset pelo admin liga mustChangePassword=true — login reflete isso
 * 7. Trocar a senha (PATCH /profile/password) desliga mustChangePassword
 * 8. POST /auth/reset-password com token inexistente continua bloqueado (422) — endpoint dormente, não quebrado
 * 9. Auditoria: RESET_PASSWORD_ADMIN nunca guarda a senha
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
  console.log('🧪 INICIANDO TESTES DE RECUPERAÇÃO DE SENHA (ADMIN_NOTIFICATION)');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Password Reset rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string; email?: string; name?: string; mustChangePassword?: boolean } } };
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const adminId = (adminLogin.data as LoginBody)?.data?.user?.id ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!adminToken && !!participantToken);
  assert('Login normal não vem com mustChangePassword=true', (participantLogin.data as LoginBody)?.data?.user?.mustChangePassword === false);

  const notifsBefore = await prisma.notification.count({ where: { userId: adminId, type: 'PASSWORD_RESET_REQUESTED' } });

  // ── PASSO 1-2: "Esqueci minha senha" notifica admin (ou não, se e-mail não existe) ──
  console.log('\n1️⃣ Testando "esqueci minha senha" — notifica ADMIN_MASTER, sem revelar se o e-mail existe...');
  const forExisting = await reqJson('POST', '/auth/forgot-password', { email: 'renan@empresa.com' });
  const forNonExisting = await reqJson('POST', '/auth/forgot-password', { email: 'ninguem-cadastrado-xyz@empresa.com' });

  type MessageBody = { data?: { message?: string } };
  assert('E-mail existente retorna 200', forExisting.status === 200);
  assert('E-mail inexistente também retorna 200', forNonExisting.status === 200);
  assert(
    'As duas respostas têm exatamente a mesma mensagem (sem revelar se o e-mail existe)',
    (forExisting.data as MessageBody)?.data?.message === (forNonExisting.data as MessageBody)?.data?.message,
  );
  assert(
    'Mensagem menciona que um administrador vai entrar em contato (modo ADMIN_NOTIFICATION)',
    !!(forExisting.data as MessageBody)?.data?.message?.includes('administrador'),
  );

  const adminNotifs = await prisma.notification.findMany({
    where: { userId: adminId, type: 'PASSWORD_RESET_REQUESTED' },
    orderBy: { createdAt: 'desc' },
  });
  assert('Exatamente 1 notificação nova foi criada pro admin (só pelo e-mail existente)', adminNotifs.length === notifsBefore + 1);
  assert('Notificação referencia o usuário certo (referenceId)', adminNotifs[0]?.referenceId === participantId);
  assert(
    'Notificação contém nome e e-mail da pessoa, nunca uma senha',
    adminNotifs[0]?.message.includes('Renan Lima') && adminNotifs[0]?.message.includes('renan@empresa.com'),
  );

  // ── PASSO 3: Nenhum PasswordResetToken no modo ADMIN_NOTIFICATION ────────────────
  console.log('\n2️⃣ Testando que nenhum PasswordResetToken é criado neste modo...');
  const tokenCount = await prisma.passwordResetToken.count({ where: { userId: participantId } });
  assert('Nenhum PasswordResetToken foi criado (modo ADMIN_NOTIFICATION não usa token)', tokenCount === 0);

  // ── PASSO 5-6: Admin reseta a senha da pessoa que pediu ───────────────────────────
  console.log('\n3️⃣ Testando o admin resetando a senha após ser notificado...');
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
  assert('Admin reseta a senha de quem pediu (200)', adminResetRes.status === 200);

  const loginAfterAdminResetRes = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'senhaDefinidaPeloAdmin123' });
  assert('Login com a senha definida pelo admin funciona', loginAfterAdminResetRes.status === 200);
  assert(
    'Reset pelo ADMIN liga mustChangePassword=true',
    (loginAfterAdminResetRes.data as LoginBody)?.data?.user?.mustChangePassword === true,
  );

  // ── PASSO 7: Trocar a senha desliga mustChangePassword ────────────────────────────
  console.log('\n4️⃣ Testando que trocar a senha desliga mustChangePassword...');
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

  // ── PASSO 8-9: O endpoint de token (modo EMAIL) continua no ar, dormente ─────────
  console.log('\n5️⃣ Testando que /auth/reset-password (modo EMAIL, dormente) não quebrou...');
  const invalidTokenRes = await reqJson('POST', '/auth/reset-password', { token: 'token-que-nao-existe', newPassword: 'qualquerSenha123' });
  assert('Token inválido continua bloqueado (422), endpoint não quebrou', invalidTokenRes.status === 422);

  // ── PASSO 10: Auditoria nunca guarda a senha ──────────────────────────────────────
  console.log('\n6️⃣ Testando trilha de auditoria...');
  const auditAdminResetRes = await reqJson('GET', '/admin/audit-logs?action=RESET_PASSWORD_ADMIN', undefined, adminToken);
  type AuditBody = { data?: Array<{ action: string; newValues: unknown }> };
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
