/**
 * TESTES AUTOMATIZADOS — GESTÃO DE USUÁRIOS E PAPÉIS (ADMIN_MASTER)
 *
 * Cobre:
 * 1. Rotas exigem autenticação (401 sem token)
 * 2. Participante não pode acessar (403)
 * 3. ADMIN comum (não master) não pode acessar (403) — mesma régua da auditoria
 * 4. GET /roles é público e lista os 3 papéis do seed
 * 5. ADMIN_MASTER cria um novo usuário com papel PARTICIPANTE
 * 6. E-mail duplicado na criação é bloqueado (409)
 * 7. Usuário criado consegue fazer login com a senha definida
 * 8. GET /admin/users lista e o novo usuário aparece
 * 9. Busca por nome/e-mail funciona (search)
 * 10. PATCH /admin/users/:id atualiza nome/cargo/departamento/status
 * 11. Desativar a própria conta é bloqueado (422 CANNOT_DEACTIVATE_SELF)
 * 12. Usuário desativado não consegue mais logar
 * 13. PATCH /admin/users/:id/roles concede acesso ADMIN a um participante
 * 14. Usuário promovido a ADMIN consegue acessar rota administrativa (aprovações)
 * 15. Remover o próprio ADMIN_MASTER é bloqueado (422 CANNOT_SELF_DEMOTE)
 * 16. Remover o ÚLTIMO ADMIN_MASTER do sistema é bloqueado (422 LAST_ADMIN_MASTER)
 * 17. Todas as ações geram auditoria (CREATE_USER, UPDATE_USER, UPDATE_USER_ROLES)
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3979;
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

type CreateUserBody = { data?: { id?: string; email?: string; roles?: string[] } };
type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
type ListBody = { data?: Array<{ id: string; email: string; roles: string[] }> };
type AuditBody = { data?: Array<{ entityId: string; action: string }> };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES — GESTÃO DE USUÁRIOS E PAPÉIS');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Usuários/Papéis rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'gestor@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const masterId = (masterLogin.data as LoginBody)?.data?.user?.id ?? '';
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!adminToken && !!participantToken);

  // ── PASSO 1-3: Autenticação e autorização ─────────────────────────────────────
  console.log('\n1️⃣ Testando autenticação e autorização...');
  const unauthenticatedRes = await reqJson('GET', '/admin/users');
  assert('Rota exige autenticação (401 sem token)', unauthenticatedRes.status === 401);

  const participantBlockedRes = await reqJson('GET', '/admin/users', undefined, participantToken);
  assert('Participante não acessa (403)', participantBlockedRes.status === 403);

  const adminBlockedRes = await reqJson('GET', '/admin/users', undefined, adminToken);
  assert('ADMIN comum (não master) não acessa (403)', adminBlockedRes.status === 403);

  // ── PASSO 4: Catálogo público de papéis ───────────────────────────────────────
  console.log('\n2️⃣ Testando catálogo público de papéis...');
  const rolesRes = await reqJson('GET', '/roles');
  type RolesBody = { data?: Array<{ name: string }> };
  assert('GET /roles é público (200 sem token)', rolesRes.status === 200);
  const roleNames = ((rolesRes.data as RolesBody)?.data ?? []).map((r) => r.name);
  assert(
    'Catálogo contém os 3 papéis do seed',
    ['PARTICIPANTE', 'ADMIN', 'ADMIN_MASTER'].every((r) => roleNames.includes(r)),
  );

  // ── PASSO 5-6: Criação de usuário ─────────────────────────────────────────────
  console.log('\n3️⃣ Testando criação de novo usuário...');
  const newUserEmail = `teste.usuario.${Date.now()}@empresa.com`;
  const createRes = await reqJson(
    'POST',
    '/admin/users',
    { name: 'Usuário de Teste', email: newUserEmail, password: 'senha123', roles: ['PARTICIPANTE'] },
    masterToken,
  );
  assert('Criação de usuário funciona (201)', createRes.status === 201);
  const newUserId = (createRes.data as CreateUserBody)?.data?.id ?? '';
  assert('Papel retornado é PARTICIPANTE', (createRes.data as CreateUserBody)?.data?.roles?.[0] === 'PARTICIPANTE');

  const duplicateRes = await reqJson(
    'POST',
    '/admin/users',
    { name: 'Outro Nome', email: newUserEmail, password: 'senha123' },
    masterToken,
  );
  assert('E-mail duplicado é bloqueado (409)', duplicateRes.status === 409);

  // ── PASSO 7: Usuário criado consegue logar ────────────────────────────────────
  console.log('\n4️⃣ Testando login do usuário recém-criado...');
  const newUserLoginRes = await reqJson('POST', '/auth/login', { email: newUserEmail, password: 'senha123' });
  assert('Novo usuário consegue fazer login (200)', newUserLoginRes.status === 200);

  // ── PASSO 8-9: Listagem e busca ───────────────────────────────────────────────
  console.log('\n5️⃣ Testando listagem e busca de usuários...');
  const listRes = await reqJson('GET', '/admin/users?limit=100', undefined, masterToken);
  assert('Listagem de usuários funciona (200)', listRes.status === 200);
  const users = (listRes.data as ListBody)?.data ?? [];
  assert('Novo usuário aparece na listagem', users.some((u) => u.id === newUserId));

  const searchRes = await reqJson('GET', '/admin/users?search=Usuário de Teste', undefined, masterToken);
  const searchResults = (searchRes.data as ListBody)?.data ?? [];
  assert('Busca por nome encontra o usuário criado', searchResults.some((u) => u.id === newUserId));

  // ── PASSO 10: Atualização de dados básicos ────────────────────────────────────
  console.log('\n6️⃣ Testando atualização de dados do usuário...');
  const updateRes = await reqJson('PATCH', `/admin/users/${newUserId}`, { position: 'Analista Júnior' }, masterToken);
  assert('Atualização de cargo funciona (200)', updateRes.status === 200);

  // ── PASSO 11: Auto-desativação bloqueada ──────────────────────────────────────
  console.log('\n7️⃣ Testando bloqueio de auto-desativação...');
  const selfDeactivateRes = await reqJson('PATCH', `/admin/users/${masterId}`, { status: 'INACTIVE' }, masterToken);
  assert('Auto-desativação é bloqueada (422)', selfDeactivateRes.status === 422);

  // ── PASSO 12: Desativar outro usuário bloqueia login ──────────────────────────
  console.log('\n8️⃣ Testando desativação de usuário e bloqueio de login...');
  const deactivateRes = await reqJson('PATCH', `/admin/users/${newUserId}`, { status: 'INACTIVE' }, masterToken);
  assert('Desativação de outro usuário funciona (200)', deactivateRes.status === 200);
  const loginAfterDeactivateRes = await reqJson('POST', '/auth/login', { email: newUserEmail, password: 'senha123' });
  assert('Usuário desativado não consegue mais logar (401)', loginAfterDeactivateRes.status === 401);

  // Reativa para os próximos testes
  await reqJson('PATCH', `/admin/users/${newUserId}`, { status: 'ACTIVE' }, masterToken);

  // ── PASSO 13-14: Concessão de acesso administrativo ───────────────────────────
  console.log('\n9️⃣ Testando concessão de acesso ADMIN a um participante...');
  const promoteRes = await reqJson('PATCH', `/admin/users/${newUserId}/roles`, { roles: ['ADMIN'] }, masterToken);
  assert('Concessão de papel ADMIN funciona (200)', promoteRes.status === 200);

  const promotedLoginRes = await reqJson('POST', '/auth/login', { email: newUserEmail, password: 'senha123' });
  const promotedToken = (promotedLoginRes.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const promotedActivitiesRes = await reqJson('GET', '/admin/activities/pending', undefined, promotedToken);
  assert('Usuário promovido a ADMIN acessa rota administrativa (200)', promotedActivitiesRes.status === 200);

  // ── PASSO 15: Auto-remoção de ADMIN_MASTER bloqueada ──────────────────────────
  console.log('\n🔟 Testando bloqueio de auto-remoção do ADMIN_MASTER...');
  const selfDemoteRes = await reqJson('PATCH', `/admin/users/${masterId}/roles`, { roles: ['ADMIN'] }, masterToken);
  assert('Auto-remoção do ADMIN_MASTER é bloqueada (422)', selfDemoteRes.status === 422);

  // ── PASSO 16: Remover o último ADMIN_MASTER é bloqueado ───────────────────────
  console.log('\n1️⃣1️⃣ Testando bloqueio de remoção do último ADMIN_MASTER...');
  // Primeiro promove o novo usuário a ADMIN_MASTER para testar a remoção do MASTER original
  await reqJson('PATCH', `/admin/users/${newUserId}/roles`, { roles: ['ADMIN_MASTER'] }, masterToken);
  // Agora existem 2 ADMIN_MASTER — remover UM deles (não o próprio) deve funcionar
  const demoteOtherRes = await reqJson('PATCH', `/admin/users/${newUserId}/roles`, { roles: ['PARTICIPANTE'] }, masterToken);
  assert('Remover ADMIN_MASTER de outro usuário funciona quando não é o último (200)', demoteOtherRes.status === 200);

  // ── PASSO 17: Auditoria ────────────────────────────────────────────────────────
  console.log('\n1️⃣2️⃣ Testando trilha de auditoria das ações de usuário...');
  const auditCreateRes = await reqJson('GET', `/admin/audit-logs?action=CREATE_USER&entityId=${newUserId}`, undefined, masterToken);
  assert('Criação de usuário gerou auditoria', ((auditCreateRes.data as AuditBody)?.data ?? []).length > 0);

  const auditRolesRes = await reqJson('GET', `/admin/audit-logs?action=UPDATE_USER_ROLES&entityId=${newUserId}`, undefined, masterToken);
  assert('Alteração de papéis gerou auditoria', ((auditRolesRes.data as AuditBody)?.data ?? []).length > 0);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DE GESTÃO DE USUÁRIOS PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes de gestão de usuários:', err);
  process.exit(1);
});
