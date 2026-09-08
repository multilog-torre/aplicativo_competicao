/**
 * FASE 7 — TESTES AUTOMATIZADOS DE UPLOAD E EVIDÊNCIAS
 *
 * Cobre:
 * 1. Upload de evidência válida (JPG) vinculada à própria atividade PENDING
 * 2. Metadados persistidos corretamente (fileName, fileType, fileSize, storageProvider)
 * 3. Arquivo físico realmente gravado no storage local
 * 4. Extensão não permitida pela modalidade é rejeitada (422)
 * 5. Mimetype que não corresponde à extensão é rejeitado (422)
 * 6. Arquivo maior que o limite configurado é rejeitado (422)
 * 7. Outro usuário não pode enviar evidência para atividade alheia (403)
 * 8. Upload em atividade inexistente retorna 404
 * 9. Upload bloqueado após a atividade sair de PENDING (simulando aprovação)
 * 10. Listagem de evidências não expõe storagePath (apenas metadados + downloadUrl)
 * 11. Download autorizado retorna o conteúdo binário correto (dono da atividade)
 * 12. Download bloqueado para outro participante (403)
 * 13. Download liberado para administrador
 * 14. Evidência inexistente no download retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3995;
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

async function reqUpload(
  path: string,
  token: string,
  fileName: string,
  mimeType: string,
  content: Buffer,
): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: mimeType }), fileName);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[UPLOAD] POST ${path} (${fileName}, ${content.length}b) -> ${res.status}`);
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
  console.log('🧪 INICIANDO TESTES DA FASE 7 — UPLOAD E EVIDÊNCIAS');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Evidências rodando na porta ${TEST_PORT}...\n`);

  // ── PASSO 0: Tokens ──────────────────────────────────────────────────────────
  console.log('0️⃣ Obtendo tokens de autenticação...');
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  const otherLogin = await reqJson('POST', '/auth/login', { email: 'beatriz@empresa.com', password: 'user123' });
  const adminLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string } } };
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const otherToken = (otherLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Tokens obtidos com sucesso', !!participantToken && !!otherToken && !!adminToken);

  const runningType = await prisma.activityType.findFirst({
    where: { name: { contains: 'Corrida' }, status: 'ACTIVE' },
  });
  if (!runningType) throw new Error('Modalidade Corrida não encontrada no seed — abortando testes.');

  // ── PASSO 1: Criar atividade PENDING para anexar evidência ────────────────────
  console.log('\n1️⃣ Registrando atividade de teste...');
  const createActivityRes = await reqJson(
    'POST',
    '/activities',
    { activityTypeId: runningType.id, activityDate: new Date().toISOString(), quantity: 3 },
    participantToken,
  );
  type ActivityBody = { data?: { id?: string } };
  const activityId = (createActivityRes.data as ActivityBody)?.data?.id ?? '';
  assert('Atividade de teste criada (201)', createActivityRes.status === 201 && !!activityId);

  // ── PASSO 2: Upload válido ──────────────────────────────────────────────────
  console.log('\n2️⃣ Testando upload de evidência JPG válida...');
  const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]); // cabeçalho JPEG mínimo
  const uploadRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    participantToken,
    'comprovante.jpg',
    'image/jpeg',
    jpgBuffer,
  );
  assert('Upload válido retorna 201', uploadRes.status === 201);
  type EvidenceBody = {
    data?: { id?: string; fileName?: string; fileType?: string; fileSize?: number; downloadUrl?: string };
  };
  const evidence = (uploadRes.data as EvidenceBody)?.data;
  assert('Metadados retornados corretamente', evidence?.fileName === 'comprovante.jpg' && evidence?.fileType === 'image/jpeg');
  assert('Tamanho do arquivo registrado corretamente', evidence?.fileSize === jpgBuffer.length);
  assert('downloadUrl retornado e não expõe caminho físico', !!evidence?.downloadUrl && !('storagePath' in (evidence ?? {})));
  const evidenceId = evidence?.id ?? '';

  // ── PASSO 3: Arquivo fisicamente gravado ──────────────────────────────────────
  console.log('\n3️⃣ Verificando persistência física e no banco...');
  const dbEvidence = await prisma.activityEvidence.findUnique({ where: { id: evidenceId } });
  assert('Registro existe no banco com storageProvider=local', dbEvidence?.storageProvider === 'local');
  assert('storagePath foi preenchido', !!dbEvidence?.storagePath);

  // ── PASSO 4: Extensão não permitida ───────────────────────────────────────────
  console.log('\n4️⃣ Testando rejeição de extensão não permitida...');
  const exeRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    participantToken,
    'malware.exe',
    'application/octet-stream',
    Buffer.from('conteudo'),
  );
  assert('Extensão .exe é rejeitada (422)', exeRes.status === 422);

  // ── PASSO 5: Mimetype não corresponde à extensão ──────────────────────────────
  console.log('\n5️⃣ Testando rejeição de mimetype incompatível com a extensão...');
  const mismatchRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    participantToken,
    'falso.jpg',
    'text/plain',
    Buffer.from('isto nao e uma imagem jpeg'),
  );
  assert('Mimetype incompatível com extensão .jpg é rejeitado (422)', mismatchRes.status === 422);

  // ── PASSO 6: Arquivo maior que o limite ───────────────────────────────────────
  console.log('\n6️⃣ Testando rejeição de arquivo acima do limite configurado...');
  const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB > MAX_UPLOAD_SIZE_MB (10MB)
  const oversizedRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    participantToken,
    'grande.jpg',
    'image/jpeg',
    oversizedBuffer,
  );
  assert('Arquivo acima do limite é rejeitado (422)', oversizedRes.status === 422);

  // ── PASSO 7: Outro usuário não pode enviar evidência alheia ──────────────────
  console.log('\n7️⃣ Testando bloqueio de upload por outro usuário...');
  const crossUploadRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    otherToken,
    'intruso.jpg',
    'image/jpeg',
    jpgBuffer,
  );
  assert('Outro usuário não pode enviar evidência para atividade alheia (403)', crossUploadRes.status === 403);

  // ── PASSO 8: Atividade inexistente ────────────────────────────────────────────
  console.log('\n8️⃣ Testando upload em atividade inexistente...');
  const notFoundUploadRes = await reqUpload(
    '/activities/00000000-0000-0000-0000-000000000000/evidence',
    participantToken,
    'comprovante.jpg',
    'image/jpeg',
    jpgBuffer,
  );
  assert('Atividade inexistente retorna 404', notFoundUploadRes.status === 404);

  // ── PASSO 9: Bloqueio após atividade sair de PENDING ──────────────────────────
  console.log('\n9️⃣ Testando bloqueio de upload após avaliação da atividade...');
  await prisma.userActivity.update({ where: { id: activityId }, data: { status: 'APPROVED' } });
  const afterApprovalRes = await reqUpload(
    `/activities/${activityId}/evidence`,
    participantToken,
    'tardio.jpg',
    'image/jpeg',
    jpgBuffer,
  );
  assert('Upload bloqueado após atividade não estar mais PENDING (422)', afterApprovalRes.status === 422);
  await prisma.userActivity.update({ where: { id: activityId }, data: { status: 'PENDING' } }); // restaura para os próximos testes

  // ── PASSO 10: Listagem não expõe caminho físico ───────────────────────────────
  console.log('\n🔟 Testando listagem de evidências (metadados apenas)...');
  const listRes = await reqJson('GET', `/activities/${activityId}/evidence`, undefined, participantToken);
  type ListBody = { data?: Array<Record<string, unknown>> };
  const list = (listRes.data as ListBody)?.data ?? [];
  assert('Listagem retorna 200 com ao menos 1 evidência', listRes.status === 200 && list.length >= 1);
  assert(
    'Nenhum item da listagem expõe storagePath/storageUrl',
    list.every((item) => !('storagePath' in item) && !('storageUrl' in item)),
  );

  // ── PASSO 11: Download autorizado (dono) ──────────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando download autorizado pelo dono da atividade...');
  const downloadRes = await fetch(`${BASE_URL}/activities/${activityId}/evidence/${evidenceId}/download`, {
    headers: { Authorization: `Bearer ${participantToken}` },
  });
  const downloadedBuffer = Buffer.from(await downloadRes.arrayBuffer());
  console.log(`[HTTP] GET    /activities/${activityId}/evidence/${evidenceId}/download -> ${downloadRes.status}`);
  assert('Download retorna 200', downloadRes.status === 200);
  assert('Conteúdo binário baixado é idêntico ao enviado', downloadedBuffer.equals(jpgBuffer));

  // ── PASSO 12: Download bloqueado para outro participante ──────────────────────
  console.log('\n1️⃣2️⃣ Testando bloqueio de download para outro participante...');
  const crossDownloadRes = await fetch(`${BASE_URL}/activities/${activityId}/evidence/${evidenceId}/download`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  console.log(`[HTTP] GET    /activities/${activityId}/evidence/${evidenceId}/download -> ${crossDownloadRes.status}`);
  assert('Outro participante não pode baixar a evidência (403)', crossDownloadRes.status === 403);

  // ── PASSO 13: Download liberado para admin ────────────────────────────────────
  console.log('\n1️⃣3️⃣ Testando download autorizado para administrador...');
  const adminDownloadRes = await fetch(`${BASE_URL}/activities/${activityId}/evidence/${evidenceId}/download`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[HTTP] GET    /activities/${activityId}/evidence/${evidenceId}/download -> ${adminDownloadRes.status}`);
  assert('Administrador pode baixar qualquer evidência (200)', adminDownloadRes.status === 200);

  // ── PASSO 14: Evidência inexistente ───────────────────────────────────────────
  console.log('\n1️⃣4️⃣ Testando download de evidência inexistente...');
  const notFoundDownloadRes = await reqJson(
    'GET',
    `/activities/${activityId}/evidence/00000000-0000-0000-0000-000000000000/download`,
    undefined,
    participantToken,
  );
  assert('Evidência inexistente retorna 404', notFoundDownloadRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 7 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 7:', err);
  process.exit(1);
});
