/**
 * FASE 15 — TESTES AUTOMATIZADOS DO MURAL SOCIAL
 *
 * Cobre:
 * 1. Mural exige autenticação (401 sem token)
 * 2. Criação de publicação de texto simples
 * 3. Criação de publicação com foto (upload via multipart)
 * 4. Feed lista publicações PUBLISHED de todos os usuários
 * 5. Curtir uma publicação incrementa likesCount e likedByMe
 * 6. Curtir duas vezes é bloqueado (409)
 * 7. Remover curtida decrementa likesCount
 * 8. Comentar em uma publicação funciona e aparece na listagem
 * 9. Comentário vazio é bloqueado (422)
 * 10. Dono exclui a própria publicação (sem necessidade de ser admin)
 * 11. Outro participante não pode excluir publicação alheia (403)
 * 12. Admin modera (oculta) uma publicação de outro usuário — some do feed padrão
 * 13. Autor ainda vê a própria publicação oculta no feed
 * 14. Comentar em publicação oculta é bloqueado (422)
 * 15. Restaurar publicação moderada a torna visível novamente
 * 16. Dono exclui o próprio comentário; outro participante é bloqueado (403)
 * 17. Admin pode excluir comentário de outro usuário (com auditoria)
 * 18. Download de foto de post funciona; post inexistente retorna 404
 * 19. Moderação de publicação inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3987;
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

async function reqCreatePostWithImage(content: string, token: string): Promise<{ status: number; data: unknown }> {
  const form = new FormData();
  form.append('content', content);
  form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'foto.jpg');
  const res = await fetch(`${BASE_URL}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  console.log(`[UPLOAD] POST /posts (com foto) -> ${res.status}`);
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
  console.log('🧪 INICIANDO TESTES DA FASE 15 — MURAL SOCIAL');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Mural rodando na porta ${TEST_PORT}...\n`);

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
  const unauthenticatedRes = await reqJson('GET', '/posts');
  assert('Mural sem token retorna 401', unauthenticatedRes.status === 401);

  // ── PASSO 2: Publicação de texto ──────────────────────────────────────────────
  console.log('\n2️⃣ Testando criação de publicação de texto...');
  const createTextForm = new FormData();
  createTextForm.append('content', 'Hoje completei minha meta semanal de corrida! 🏃');
  const createTextRes = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${participantToken}` },
    body: createTextForm,
  });
  const createTextData = await createTextRes.json();
  console.log(`[UPLOAD] POST /posts (texto) -> ${createTextRes.status}`);
  assert('Publicação de texto criada (201)', createTextRes.status === 201);
  type PostBody = { data?: { id?: string; hasImage?: boolean; status?: string } };
  const textPostId = (createTextData as PostBody)?.data?.id ?? '';
  assert('hasImage é false quando nenhum arquivo é enviado', (createTextData as PostBody)?.data?.hasImage === false);

  // ── PASSO 3: Publicação com foto ──────────────────────────────────────────────
  console.log('\n3️⃣ Testando criação de publicação com foto...');
  const createImageRes = await reqCreatePostWithImage('Confira a foto do meu treino de hoje!', participantToken);
  assert('Publicação com foto criada (201)', createImageRes.status === 201);
  const imagePost = (createImageRes.data as PostBody)?.data;
  assert('hasImage é true', imagePost?.hasImage === true);
  const imagePostId = imagePost?.id ?? '';

  // ── PASSO 4: Feed lista publicações ───────────────────────────────────────────
  console.log('\n4️⃣ Testando listagem do feed...');
  const feedRes = await reqJson('GET', '/posts', undefined, otherToken);
  type ListBody = { data?: Array<{ id: string }> };
  const feed = (feedRes.data as ListBody)?.data ?? [];
  assert('Feed retorna 200 e contém as publicações criadas', feedRes.status === 200 && feed.some((p) => p.id === textPostId));

  // ── PASSO 5-7: Curtidas ────────────────────────────────────────────────────────
  console.log('\n5️⃣ Testando curtir e descurtir uma publicação...');
  const likeRes = await reqJson('POST', `/posts/${textPostId}/like`, undefined, otherToken);
  assert('Curtida registrada (201)', likeRes.status === 201);

  const afterLikeRes = await reqJson('GET', `/posts/${textPostId}`, undefined, otherToken);
  type DetailBody = { data?: { likesCount?: number; likedByMe?: boolean } };
  assert('likesCount incrementado e likedByMe=true', (afterLikeRes.data as DetailBody)?.data?.likesCount === 1 && (afterLikeRes.data as DetailBody)?.data?.likedByMe === true);

  const doubleLikeRes = await reqJson('POST', `/posts/${textPostId}/like`, undefined, otherToken);
  assert('Curtir duas vezes é bloqueado (409)', doubleLikeRes.status === 409);

  const unlikeRes = await reqJson('DELETE', `/posts/${textPostId}/like`, undefined, otherToken);
  assert('Remoção de curtida funciona (200)', unlikeRes.status === 200);
  const afterUnlikeRes = await reqJson('GET', `/posts/${textPostId}`, undefined, otherToken);
  assert('likesCount voltou a 0', (afterUnlikeRes.data as DetailBody)?.data?.likesCount === 0);

  // ── PASSO 8-9: Comentários ─────────────────────────────────────────────────────
  console.log('\n6️⃣ Testando comentários...');
  const commentRes = await reqJson('POST', `/posts/${textPostId}/comments`, { content: 'Parabéns! 🎉' }, otherToken);
  assert('Comentário criado (201)', commentRes.status === 201);
  type CommentBody = { data?: { id?: string } };
  const commentId = (commentRes.data as CommentBody)?.data?.id ?? '';

  const listCommentsRes = await reqJson('GET', `/posts/${textPostId}/comments`, undefined, participantToken);
  type CommentListBody = { data?: Array<{ id: string; content: string }> };
  const comments = (listCommentsRes.data as CommentListBody)?.data ?? [];
  assert('Comentário aparece na listagem', comments.some((c) => c.id === commentId));

  const emptyCommentRes = await reqJson('POST', `/posts/${textPostId}/comments`, { content: '' }, otherToken);
  assert('Comentário vazio é bloqueado (422)', emptyCommentRes.status === 422);

  // ── PASSO 10-11: Exclusão de publicação ───────────────────────────────────────
  console.log('\n7️⃣ Testando exclusão de publicação...');
  const crossDeleteRes = await reqJson('DELETE', `/posts/${imagePostId}`, undefined, otherToken);
  assert('Outro participante não pode excluir publicação alheia (403)', crossDeleteRes.status === 403);

  const ownDeleteRes = await reqJson('DELETE', `/posts/${imagePostId}`, undefined, participantToken);
  assert('Dono exclui a própria publicação (200)', ownDeleteRes.status === 200);
  const deletedCheck = await prisma.post.findUnique({ where: { id: imagePostId } });
  assert('Publicação removida do banco', deletedCheck === null);

  // ── PASSO 12-15: Moderação administrativa ─────────────────────────────────────
  console.log('\n8️⃣ Testando moderação administrativa...');
  const hideRes = await reqJson('POST', `/posts/${textPostId}/moderate`, { action: 'HIDE', reason: 'Conteúdo em análise.' }, masterToken);
  assert('Admin oculta publicação (200)', hideRes.status === 200);

  const feedAfterHideRes = await reqJson('GET', '/posts', undefined, otherToken);
  const feedAfterHide = (feedAfterHideRes.data as ListBody)?.data ?? [];
  assert('Publicação oculta some do feed de outros participantes', !feedAfterHide.some((p) => p.id === textPostId));

  const ownFeedAfterHideRes = await reqJson('GET', '/posts', undefined, participantToken);
  const ownFeedAfterHide = (ownFeedAfterHideRes.data as ListBody)?.data ?? [];
  assert('Autor ainda vê a própria publicação oculta', ownFeedAfterHide.some((p) => p.id === textPostId));

  const commentOnHiddenRes = await reqJson('POST', `/posts/${textPostId}/comments`, { content: 'Tentando comentar' }, otherToken);
  assert('Comentar em publicação oculta é bloqueado (422)', commentOnHiddenRes.status === 422);

  const restoreRes = await reqJson('POST', `/posts/${textPostId}/moderate`, { action: 'RESTORE' }, masterToken);
  assert('Admin restaura publicação (200)', restoreRes.status === 200);
  const feedAfterRestoreRes = await reqJson('GET', '/posts', undefined, otherToken);
  const feedAfterRestore = (feedAfterRestoreRes.data as ListBody)?.data ?? [];
  assert('Publicação restaurada volta a aparecer no feed', feedAfterRestore.some((p) => p.id === textPostId));

  // ── PASSO 16-17: Exclusão de comentários ──────────────────────────────────────
  console.log('\n9️⃣ Testando exclusão de comentários...');
  const crossCommentDeleteRes = await reqJson('DELETE', `/posts/${textPostId}/comments/${commentId}`, undefined, participantToken);
  assert('Dono do post (mas não do comentário) não pode excluir comentário alheio (403)', crossCommentDeleteRes.status === 403);

  const ownCommentDeleteRes = await reqJson('DELETE', `/posts/${textPostId}/comments/${commentId}`, undefined, otherToken);
  assert('Autor do comentário consegue excluir o próprio comentário (200)', ownCommentDeleteRes.status === 200);

  const secondCommentRes = await reqJson('POST', `/posts/${textPostId}/comments`, { content: 'Outro comentário' }, otherToken);
  const secondCommentId = (secondCommentRes.data as CommentBody)?.data?.id ?? '';
  const adminCommentDeleteRes = await reqJson('DELETE', `/posts/${textPostId}/comments/${secondCommentId}`, undefined, masterToken);
  assert('Admin pode excluir comentário de outro usuário (200)', adminCommentDeleteRes.status === 200);
  const moderationLogRes = await reqJson('GET', '/admin/audit-logs?action=MODERATE_COMMENT', undefined, masterToken);
  type AuditBody = { data?: Array<{ entityId: string }> };
  assert(
    'Exclusão administrativa de comentário gerou auditoria',
    ((moderationLogRes.data as AuditBody)?.data ?? []).some((l) => l.entityId === secondCommentId),
  );

  // ── PASSO 18: Foto do post ─────────────────────────────────────────────────────
  console.log('\n🔟 Testando download de foto de publicação...');
  const secondImageRes = await reqCreatePostWithImage('Nova foto de teste.', participantToken);
  const secondImagePostId = (secondImageRes.data as PostBody)?.data?.id ?? '';
  const imageDownloadRes = await fetch(`${BASE_URL}/posts/${secondImagePostId}/image`, {
    headers: { Authorization: `Bearer ${participantToken}` },
  });
  console.log(`[HTTP] GET    /posts/${secondImagePostId}/image -> ${imageDownloadRes.status}`);
  assert('Download da foto do post funciona (200)', imageDownloadRes.status === 200);

  const notFoundImageRes = await reqJson('GET', '/posts/00000000-0000-0000-0000-000000000000/image', undefined, participantToken);
  assert('Post inexistente no download de imagem retorna 404', notFoundImageRes.status === 404);

  // ── PASSO 19: Moderação de post inexistente ───────────────────────────────────
  console.log('\n1️⃣1️⃣ Testando moderação de publicação inexistente...');
  const notFoundModerateRes = await reqJson(
    'POST',
    '/posts/00000000-0000-0000-0000-000000000000/moderate',
    { action: 'HIDE' },
    masterToken,
  );
  assert('Moderação de publicação inexistente retorna 404', notFoundModerateRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 15 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 15:', err);
  process.exit(1);
});
