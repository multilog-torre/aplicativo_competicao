/**
 * FASE 15 — TESTES AUTOMATIZADOS DO MURAL SOCIAL
 *
 * Cobre:
 * 1. Mural exige autenticação (401 sem token)
 * 2. Criação de publicação de texto simples
 * 3. Criação de publicação com foto (upload via multipart)
 * 4. Feed lista publicações PUBLISHED de todos os usuários
 * 5. Reagir a uma publicação incrementa reactionsCount e define myReaction
 * 6. Trocar de emoji substitui a reação (não duplica — continua 1 por pessoa/post)
 * 7. Remover reação zera reactionsCount; remover de novo dá 404
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

  // ── PASSO 5-7: Reações (qualquer emoji) ───────────────────────────────────────────
  console.log('\n5️⃣ Testando reagir, trocar e remover reação de uma publicação...');
  const reactRes = await reqJson('POST', `/posts/${textPostId}/reactions`, { emoji: '👍' }, otherToken);
  assert('Reação registrada (201)', reactRes.status === 201);

  const afterReactRes = await reqJson('GET', `/posts/${textPostId}`, undefined, otherToken);
  type DetailBody = { data?: { reactionsCount?: number; myReaction?: string | null; reactionsSummary?: Array<{ emoji: string; count: number }> } };
  assert(
    'reactionsCount incrementado e myReaction=👍',
    (afterReactRes.data as DetailBody)?.data?.reactionsCount === 1 && (afterReactRes.data as DetailBody)?.data?.myReaction === '👍',
  );

  const switchReactRes = await reqJson('POST', `/posts/${textPostId}/reactions`, { emoji: '🦄' }, otherToken);
  assert('Trocar pra um emoji fora do conjunto antigo (fixo) funciona — agora é livre (201)', switchReactRes.status === 201);
  const afterSwitchRes = await reqJson('GET', `/posts/${textPostId}`, undefined, otherToken);
  assert(
    'Trocar de emoji substitui a reação — reactionsCount continua 1, myReaction=🦄',
    (afterSwitchRes.data as DetailBody)?.data?.reactionsCount === 1 && (afterSwitchRes.data as DetailBody)?.data?.myReaction === '🦄',
  );

  const invalidEmojiRes = await reqJson('POST', `/posts/${textPostId}/reactions`, { emoji: 'abc' }, otherToken);
  assert('Texto que não é emoji é bloqueado (422)', invalidEmojiRes.status === 422);

  const multipleEmojiRes = await reqJson('POST', `/posts/${textPostId}/reactions`, { emoji: '👍👍' }, otherToken);
  assert('Mais de 1 emoji colado é bloqueado (422)', multipleEmojiRes.status === 422);

  const complexEmojiRes = await reqJson('POST', `/posts/${textPostId}/reactions`, { emoji: '👨‍👩‍👧‍👦' }, otherToken);
  assert('Emoji complexo (sequência ZWJ, família) é aceito como 1 emoji só (201)', complexEmojiRes.status === 201);

  const removeReactRes = await reqJson('DELETE', `/posts/${textPostId}/reactions`, undefined, otherToken);
  assert('Remoção de reação funciona (200)', removeReactRes.status === 200);
  const afterRemoveRes = await reqJson('GET', `/posts/${textPostId}`, undefined, otherToken);
  assert('reactionsCount voltou a 0 e myReaction=null', (afterRemoveRes.data as DetailBody)?.data?.reactionsCount === 0 && (afterRemoveRes.data as DetailBody)?.data?.myReaction === null);

  const doubleRemoveRes = await reqJson('DELETE', `/posts/${textPostId}/reactions`, undefined, otherToken);
  assert('Remover reação inexistente retorna 404', doubleRemoveRes.status === 404);

  type NotifBody = { data?: Array<{ type: string; referenceId: string | null }> };
  const notifAfterReactionRes = await reqJson('GET', '/notifications?limit=50', undefined, participantToken);
  const notifsAfterReaction = (notifAfterReactionRes.data as NotifBody)?.data ?? [];
  assert(
    'Dono do post recebe notificação POST_REACTION quando alguém reage (mesmo após a reação ter sido removida depois)',
    notifsAfterReaction.some((n) => n.type === 'POST_REACTION' && n.referenceId === textPostId),
  );

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

  const notifAfterCommentRes = await reqJson('GET', '/notifications?limit=50', undefined, participantToken);
  const notifsAfterComment = (notifAfterCommentRes.data as NotifBody)?.data ?? [];
  assert(
    'Dono do post recebe notificação POST_COMMENT quando alguém comenta',
    notifsAfterComment.some((n) => n.type === 'POST_COMMENT' && n.referenceId === textPostId),
  );

  const selfCommentRes = await reqJson('POST', `/posts/${textPostId}/comments`, { content: 'Comentário do próprio dono' }, participantToken);
  assert('Dono comenta na própria publicação (201)', selfCommentRes.status === 201);
  const notifCountBefore = notifsAfterComment.filter((n) => n.type === 'POST_COMMENT' && n.referenceId === textPostId).length;
  const notifAfterSelfCommentRes = await reqJson('GET', '/notifications?limit=50', undefined, participantToken);
  const notifsAfterSelfComment = ((notifAfterSelfCommentRes.data as NotifBody)?.data ?? []).filter(
    (n) => n.type === 'POST_COMMENT' && n.referenceId === textPostId,
  );
  assert('Comentar na própria publicação não gera notificação para si mesmo', notifsAfterSelfComment.length === notifCountBefore);

  // ── PASSO 9.5: Reações em comentários ───────────────────────────────────────────
  // commentId é de um comentário da Beatriz (otherToken) no post do Renan
  // (participantToken) — reagir aqui deve notificar a BEATRIZ (autora do
  // comentário), não o Renan (dono do post).
  console.log('\n6️⃣.5 Testando reações em comentários...');
  const commentReactRes = await reqJson('POST', `/posts/${textPostId}/comments/${commentId}/reactions`, { emoji: '👏' }, participantToken);
  assert('Reagir a um comentário funciona (201)', commentReactRes.status === 201);

  const commentsAfterReactRes = await reqJson('GET', `/posts/${textPostId}/comments`, undefined, participantToken);
  type CommentListBody2 = { data?: Array<{ id: string; reactionsCount?: number; myReaction?: string | null; reactionsSummary?: Array<{ emoji: string; count: number }> }> };
  const reactedComment = ((commentsAfterReactRes.data as CommentListBody2)?.data ?? []).find((c) => c.id === commentId);
  assert(
    'Listagem de comentários reflete a reação (reactionsCount=1, myReaction=👏)',
    reactedComment?.reactionsCount === 1 && reactedComment?.myReaction === '👏',
  );

  const invalidCommentEmojiRes = await reqJson('POST', `/posts/${textPostId}/comments/${commentId}/reactions`, { emoji: 'não é emoji' }, participantToken);
  assert('Emoji inválido em comentário é bloqueado (422)', invalidCommentEmojiRes.status === 422);

  const notifAfterCommentReactRes = await reqJson('GET', '/notifications?limit=50', undefined, otherToken);
  const notifsAfterCommentReact = (notifAfterCommentReactRes.data as NotifBody)?.data ?? [];
  assert(
    'Autora do COMENTÁRIO (não o dono do post) recebe a notificação de reação',
    notifsAfterCommentReact.some((n) => n.type === 'POST_REACTION' && n.referenceId === textPostId),
  );

  const selfCommentReactRes = await reqJson('POST', `/posts/${textPostId}/comments/${commentId}/reactions`, { emoji: '🔥' }, otherToken);
  assert('Autora reage no próprio comentário (201)', selfCommentReactRes.status === 201);
  const notifCountBeforeSelfReact = notifsAfterCommentReact.filter((n) => n.type === 'POST_REACTION' && n.referenceId === textPostId).length;
  const notifAfterSelfCommentReactRes = await reqJson('GET', '/notifications?limit=50', undefined, otherToken);
  const notifsAfterSelfCommentReact = ((notifAfterSelfCommentReactRes.data as NotifBody)?.data ?? []).filter(
    (n) => n.type === 'POST_REACTION' && n.referenceId === textPostId,
  );
  assert('Reagir no próprio comentário não gera notificação para si mesma', notifsAfterSelfCommentReact.length === notifCountBeforeSelfReact);

  const removeCommentReactRes = await reqJson('DELETE', `/posts/${textPostId}/comments/${commentId}/reactions`, undefined, participantToken);
  assert('Remover reação de comentário funciona (200)', removeCommentReactRes.status === 200);
  const removeCommentReactAgainRes = await reqJson('DELETE', `/posts/${textPostId}/comments/${commentId}/reactions`, undefined, participantToken);
  assert('Remover reação de comentário inexistente retorna 404', removeCommentReactAgainRes.status === 404);

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
