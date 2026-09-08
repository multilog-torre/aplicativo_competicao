/**
 * FASE 18 — TESTES AUTOMATIZADOS DE PERFIL E AVATAR
 *
 * Cobre:
 * 1. Perfil exige autenticação (401 sem token)
 * 2. Perfil próprio retorna dados completos (pontos, nível, ranking, conquistas, atividades)
 * 3. Catálogo de avatares pré-definidos é acessível e não vazio
 * 4. Seleção de avatar PRESET funciona e reflete no perfil
 * 5. presetId inválido é bloqueado (422)
 * 6. Upload de foto (UPLOAD) funciona e gera avatarUrl como downloadUrl
 * 7. Download da foto de avatar funciona e retorna o conteúdo correto
 * 8. Trocar para INITIALS limpa o avatarUrl
 * 9. Perfil público de outro usuário mostra dados básicos (nome, nível, pontos, ranking)
 * 10. Perfil público de outro usuário NÃO lista as conquistas (apenas a contagem)
 * 11. Perfil público de outro usuário NÃO expõe atividades recentes
 * 12. Perfil próprio de fato lista as conquistas e atividades recentes
 * 13. Download de avatar de usuário sem foto enviada retorna 404
 * 14. Usuário inexistente no perfil público retorna 404
 * 15. GET /departments lista departamentos ativos publicamente
 * 16. PATCH /profile atualiza nome/cargo/departamento e reflete no perfil
 * 17. PATCH /profile com departmentId inexistente retorna 404 (sem alterar nada)
 * 18. Autoedição de perfil gera entrada de auditoria (UPDATE_PROFILE)
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3984;
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

async function reqSetAvatar(
  token: string,
  avatarType: string,
  presetId?: string,
  fileBuffer?: Buffer,
): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('avatarType', avatarType);
  if (presetId) form.append('presetId', presetId);
  if (fileBuffer) form.append('file', new Blob([fileBuffer], { type: 'image/jpeg' }), 'avatar.jpg');
  const res = await fetch(`${BASE_URL}/profile/avatar`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[UPLOAD] PATCH /profile/avatar (${avatarType}) -> ${res.status}`);
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
  console.log('🧪 INICIANDO TESTES DA FASE 18 — PERFIL E AVATAR');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Perfil rodando na porta ${TEST_PORT}...\n`);

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

  // ── PASSO 1: Autenticação obrigatória ─────────────────────────────────────────
  console.log('\n1️⃣ Testando exigência de autenticação...');
  const unauthenticatedRes = await reqJson('GET', '/profile');
  assert('Perfil sem token retorna 401', unauthenticatedRes.status === 401);

  // ── Prepara dados: aprova uma atividade para ter perfil rico ──────────────────
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
  await reqJson('POST', `/admin/activities/${activityId}/approve`, undefined, masterToken);

  // ── PASSO 2: Perfil próprio completo ──────────────────────────────────────────
  console.log('\n2️⃣ Testando perfil próprio completo...');
  const ownProfileRes = await reqJson('GET', '/profile', undefined, participantToken);
  type ProfileBody = {
    data?: {
      totalPoints?: number;
      level?: { name?: string };
      ranking?: { position?: number | null };
      achievements?: unknown[];
      achievementsCount?: number;
      recentActivities?: unknown[];
    };
  };
  assert('Perfil próprio retorna 200', ownProfileRes.status === 200);
  const ownProfile = (ownProfileRes.data as ProfileBody)?.data;
  assert('Perfil contém totalPoints > 0', (ownProfile?.totalPoints ?? 0) > 0);
  assert('Perfil contém nível', !!ownProfile?.level?.name);
  assert('Perfil contém posição no ranking', typeof ownProfile?.ranking?.position === 'number');

  // ── PASSO 3: Catálogo de avatares ─────────────────────────────────────────────
  console.log('\n3️⃣ Testando catálogo de avatares pré-definidos...');
  const presetsRes = await reqJson('GET', '/profile/avatar-presets', undefined, participantToken);
  type PresetsBody = { data?: Array<{ id: string; label: string; icon: string }> };
  const presets = (presetsRes.data as PresetsBody)?.data ?? [];
  assert('Catálogo de avatares não está vazio', presets.length > 0);

  // ── PASSO 4-5: Seleção de avatar PRESET ───────────────────────────────────────
  console.log('\n4️⃣ Testando seleção de avatar pré-definido...');
  const validPresetId = presets[0]?.id ?? '';
  const setPresetRes = await reqSetAvatar(participantToken, 'PRESET', validPresetId);
  assert('Seleção de avatar PRESET funciona (200)', setPresetRes.status === 200);
  type AvatarBody = { data?: { avatarType?: string; avatarUrl?: string | null } };
  assert(
    'avatarUrl reflete o ícone do preset selecionado',
    (setPresetRes.data as AvatarBody)?.data?.avatarUrl === presets[0]?.icon,
  );

  const invalidPresetRes = await reqSetAvatar(participantToken, 'PRESET', 'preset-inexistente-xyz');
  assert('presetId inválido é bloqueado (422)', invalidPresetRes.status === 422);

  // ── PASSO 6-7: Upload de foto ─────────────────────────────────────────────────
  console.log('\n5️⃣ Testando upload de foto de avatar...');
  const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const uploadRes = await reqSetAvatar(participantToken, 'UPLOAD', undefined, jpgBuffer);
  assert('Upload de foto funciona (200)', uploadRes.status === 200);
  const uploadData = (uploadRes.data as AvatarBody)?.data;
  assert('avatarType retornado é UPLOAD', uploadData?.avatarType === 'UPLOAD');
  assert('avatarUrl é uma downloadUrl (não caminho físico)', uploadData?.avatarUrl === `/api/v1/profile/${participantId}/avatar`);

  const downloadRes = await fetch(`${BASE_URL}/profile/${participantId}/avatar`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  const downloadedBuffer = Buffer.from(await downloadRes.arrayBuffer());
  console.log(`[HTTP] GET    /profile/${participantId}/avatar -> ${downloadRes.status}`);
  assert('Download do avatar funciona para QUALQUER autenticado (200)', downloadRes.status === 200);
  assert('Conteúdo do avatar baixado é idêntico ao enviado', downloadedBuffer.equals(jpgBuffer));

  // ── PASSO 8: Voltar para INITIALS limpa avatarUrl ─────────────────────────────
  console.log('\n6️⃣ Testando retorno para avatar de iniciais...');
  const setInitialsRes = await reqSetAvatar(participantToken, 'INITIALS');
  assert('Retorno para INITIALS funciona (200)', setInitialsRes.status === 200);
  assert('avatarUrl fica null em INITIALS', (setInitialsRes.data as AvatarBody)?.data?.avatarUrl === null);

  // ── PASSO 9-11: Perfil público de outro usuário ───────────────────────────────
  console.log('\n7️⃣ Testando perfil público (dados básicos, sem privacidade violada)...');
  const publicProfileRes = await reqJson('GET', `/profile/${participantId}`, undefined, otherToken);
  assert('Perfil público retorna 200', publicProfileRes.status === 200);
  const publicProfile = (publicProfileRes.data as ProfileBody)?.data;
  assert('Perfil público contém totalPoints e level (já públicos via /ranking)', !!publicProfile?.level && typeof publicProfile.totalPoints === 'number');
  assert('Perfil público NÃO lista achievements (apenas contagem)', publicProfile?.achievements === undefined && typeof publicProfile?.achievementsCount === 'number');
  assert('Perfil público NÃO expõe recentActivities', publicProfile?.recentActivities === undefined);

  // ── PASSO 12: Perfil próprio lista tudo ───────────────────────────────────────
  console.log('\n8️⃣ Confirmando que o perfil PRÓPRIO lista conquistas e atividades...');
  const ownProfileAgainRes = await reqJson('GET', '/profile', undefined, participantToken);
  const ownProfileAgain = (ownProfileAgainRes.data as ProfileBody)?.data;
  assert('Perfil próprio lista achievements (array)', Array.isArray(ownProfileAgain?.achievements));
  assert('Perfil próprio lista recentActivities (array)', Array.isArray(ownProfileAgain?.recentActivities));

  // ── PASSO 13: Download de avatar sem foto ─────────────────────────────────────
  console.log('\n9️⃣ Testando download de avatar de usuário sem foto enviada...');
  const noAvatarRes = await fetch(`${BASE_URL}/profile/${participantId}/avatar`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  console.log(`[HTTP] GET    /profile/${participantId}/avatar -> ${noAvatarRes.status}`);
  assert('Download de avatar inexistente (voltou para INITIALS) retorna 404', noAvatarRes.status === 404);

  // ── PASSO 14: Usuário inexistente ─────────────────────────────────────────────
  console.log('\n🔟 Testando usuário inexistente no perfil público...');
  const notFoundRes = await reqJson('GET', '/profile/00000000-0000-0000-0000-000000000000', undefined, participantToken);
  assert('Usuário inexistente retorna 404', notFoundRes.status === 404);

  // ── PASSO 15: Catálogo público de departamentos ───────────────────────────────
  console.log('\n1️⃣1️⃣ Testando catálogo público de departamentos...');
  const deptListRes = await reqJson('GET', '/departments');
  type DeptListBody = { data?: Array<{ id: string; name: string }> };
  assert('Listagem de departamentos é pública (200 sem token)', deptListRes.status === 200);
  const departments = (deptListRes.data as DeptListBody)?.data ?? [];
  assert('Catálogo de departamentos não está vazio', departments.length > 0);
  const otherDepartment = departments.find((d) => d.name !== 'Tecnologia da Informação') ?? departments[0];

  // ── PASSO 16: Autoedição de nome/cargo/departamento ───────────────────────────
  console.log('\n1️⃣2️⃣ Testando autoedição de nome, cargo e departamento...');
  const updateProfileRes = await reqJson(
    'PATCH',
    '/profile',
    { name: 'Renan Lima Editado', position: 'Engenheiro de Software Sênior', departmentId: otherDepartment.id },
    participantToken,
  );
  assert('Atualização de perfil executada com sucesso (200)', updateProfileRes.status === 200);
  type UpdateProfileBody = { data?: { name?: string; position?: string; department?: { id?: string; name?: string } } };
  const updatedProfileData = (updateProfileRes.data as UpdateProfileBody)?.data;
  assert('Nome retornado reflete a alteração', updatedProfileData?.name === 'Renan Lima Editado');
  assert('Departamento retornado reflete a alteração', updatedProfileData?.department?.id === otherDepartment.id);

  const profileAfterUpdateRes = await reqJson('GET', '/profile', undefined, participantToken);
  const profileAfterUpdate = (profileAfterUpdateRes.data as UpdateProfileBody)?.data;
  assert('GET /profile também reflete o novo nome', profileAfterUpdate?.name === 'Renan Lima Editado');

  // ── PASSO 17: departmentId inexistente ────────────────────────────────────────
  console.log('\n1️⃣3️⃣ Testando departamento inexistente na autoedição...');
  const invalidDeptRes = await reqJson(
    'PATCH',
    '/profile',
    { departmentId: '00000000-0000-0000-0000-000000000000' },
    participantToken,
  );
  assert('departmentId inexistente retorna 404', invalidDeptRes.status === 404);
  const profileAfterInvalidRes = await reqJson('GET', '/profile', undefined, participantToken);
  const profileAfterInvalid = (profileAfterInvalidRes.data as UpdateProfileBody)?.data;
  assert('Nome permanece inalterado após tentativa inválida', profileAfterInvalid?.name === 'Renan Lima Editado');

  // ── PASSO 18: Auditoria da autoedição ─────────────────────────────────────────
  console.log('\n1️⃣4️⃣ Testando auditoria da autoedição de perfil...');
  const auditRes = await reqJson('GET', `/admin/audit-logs?action=UPDATE_PROFILE&userId=${participantId}`, undefined, masterToken);
  type AuditBody = { data?: Array<{ entityId: string }> };
  assert(
    'Autoedição de perfil gerou entrada de auditoria',
    ((auditRes.data as AuditBody)?.data ?? []).some((l) => l.entityId === participantId),
  );

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 18 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 18:', err);
  process.exit(1);
});
