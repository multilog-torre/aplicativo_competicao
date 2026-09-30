import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuthedImage } from '../api/useAuthedImage';
import { Comment, CommunityEvent, Post, ReactionEmojiCode } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Avatar, emojiForIcon } from '../components/ui/Badge';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { ImageLightbox } from '../components/ui/ImageLightbox';
import { ReactionPicker, ReactionSummaryItem } from '../components/ui/ReactionPicker';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/** Aplica localmente o efeito de trocar/remover uma reação sobre um resumo agregado — usado tanto pra post quanto pra comentário (otimista, revertido se a chamada à API falhar). */
function applyReactionLocally(
  summary: ReactionSummaryItem[],
  previousReaction: ReactionEmojiCode | null,
  nextEmoji: ReactionEmojiCode | null,
): ReactionSummaryItem[] {
  let next = summary.map((r) => ({ ...r }));
  if (previousReaction) {
    next = next.map((r) => (r.emoji === previousReaction ? { ...r, count: r.count - 1 } : r)).filter((r) => r.count > 0);
  }
  if (nextEmoji) {
    const existing = next.find((r) => r.emoji === nextEmoji);
    if (existing) existing.count += 1;
    else next.push({ emoji: nextEmoji, count: 1 });
  }
  return next;
}

/**
 * Mural — feed geral da empresa, mais uma aba por evento em que o usuário
 * está participando (a pedido do usuário: "como se fosse um grupo para o
 * pessoal poder se comunicar"). Cada grupo só aparece pra quem participa
 * daquele evento, e a pessoa pode sair quando quiser (perde a aba).
 */
export function MuralPage() {
  const [myEvents, setMyEvents] = useState<CommunityEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null); // null = Mural geral

  function loadMyEvents() {
    api
      .get<CommunityEvent[]>('/events?participating=true')
      .then(({ data }) => setMyEvents(data))
      .catch(() => setMyEvents([]));
  }

  useEffect(loadMyEvents, []);

  const activeEvent = myEvents.find((e) => e.id === activeEventId) ?? null;

  return (
    <div className="page">
      <h1 className="page__title">Mural</h1>

      <div className="tabs" role="tablist" aria-label="Abas do mural">
        <button type="button" className={`tabs__item ${activeEventId === null ? 'tabs__item--active' : ''}`} onClick={() => setActiveEventId(null)}>
          📣 Mural geral
        </button>
        {myEvents.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`tabs__item ${activeEventId === e.id ? 'tabs__item--active' : ''}`}
            onClick={() => setActiveEventId(e.id)}
          >
            🎉 {e.title}
          </button>
        ))}
      </div>

      <MuralFeed
        key={activeEventId ?? 'general'}
        eventId={activeEventId}
        eventTitle={activeEvent?.title}
        onLeftGroup={() => {
          setActiveEventId(null);
          loadMyEvents();
        }}
      />
    </div>
  );
}

function MuralFeed({
  eventId,
  eventTitle,
  onLeftGroup,
}: {
  eventId: string | null;
  eventTitle?: string;
  onLeftGroup: () => void;
}) {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Filtro de moderação — só pra admin: por padrão vê o mesmo feed de
  // qualquer participante (PUBLISHED + as próprias); pode escolher ver a
  // fila de ocultas/moderadas de todo mundo, pra poder restaurar.
  const [statusFilter, setStatusFilter] = useState<'' | 'HIDDEN' | 'MODERATED'>('');

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: '30' });
    if (eventId) params.set('eventId', eventId);
    if (isAdmin && statusFilter) params.set('status', statusFilter);
    api
      .get<Post[]>(`/posts?${params.toString()}`)
      .then(({ data }) => setPosts(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o mural.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [eventId, statusFilter]);

  async function handleLeaveGroup() {
    if (!eventId) return;
    setLeaving(true);
    try {
      await api.post(`/events/${eventId}/leave`);
      showToast('Você saiu do grupo.', 'info');
      onLeftGroup();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível sair do grupo.', 'error');
    } finally {
      setLeaving(false);
      setConfirmLeaveOpen(false);
    }
  }

  return (
    <div>
      <div className="page__header">
        <p style={{ margin: 0 }}>
          {eventId
            ? 'Grupo só visível pra quem participa deste evento. Você pode sair quando quiser.'
            : 'Compartilhe algo com toda a equipe.'}
        </p>
        <div className="table__actions">
          {isAdmin && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'HIDDEN' | 'MODERATED')}
              aria-label="Filtrar por status de moderação"
            >
              <option value="">Publicações visíveis</option>
              <option value="HIDDEN">🙈 Ocultas (de todos)</option>
              <option value="MODERATED">⚠️ Moderadas (de todos)</option>
            </select>
          )}
          {eventId && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirmLeaveOpen(true)}>
              🚪 Sair do grupo
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setComposerOpen(true)}>
            + Nova publicação
          </button>
        </div>
      </div>

      {loading && <LoadingState label="Carregando o mural…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && posts.length === 0 && (
        <EmptyState
          icon={eventId ? '🎉' : '📣'}
          title="Nenhuma publicação ainda"
          description={eventId ? 'Seja o primeiro a comentar no grupo do evento!' : 'Seja o primeiro a compartilhar algo com a equipe!'}
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="post-feed">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onChanged={load} />
          ))}
        </div>
      )}

      {composerOpen && (
        <ComposerModal
          eventId={eventId}
          onClose={() => setComposerOpen(false)}
          onCreated={() => {
            setComposerOpen(false);
            showToast('Publicação criada com sucesso!', 'success');
            load();
          }}
        />
      )}

      {confirmLeaveOpen && (
        <ConfirmModal
          title="Sair do grupo"
          message={`Você vai deixar de ver e participar do grupo "${eventTitle ?? 'deste evento'}". Você pode entrar de novo participando do evento outra vez.`}
          confirmLabel="Sair do grupo"
          danger
          loading={leaving}
          onConfirm={handleLeaveGroup}
          onCancel={() => setConfirmLeaveOpen(false)}
        />
      )}
    </div>
  );
}

const MODERATION_STATUS_LABELS: Record<string, string> = {
  HIDDEN: '🙈 Oculta',
  MODERATED: '⚠️ Moderada',
};

function PostCard({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  // post.imageDownloadUrl já vem com o prefixo "/api/v1" embutido (post.service.ts),
  // enquanto API_URL/useAuthedImage já incluem esse mesmo prefixo — removê-lo aqui
  // evita duplicar "/api/v1/api/v1/..." na requisição (mesmo padrão de ActivitiesPage.tsx).
  const postImageRelativePath = post.imageDownloadUrl?.replace(/^\/api\/v1/, '') ?? null;
  const { url: imageUrl, loading: imageLoading } = useAuthedImage(post.hasImage ? postImageRelativePath : null);
  const [myReaction, setMyReaction] = useState(post.myReaction);
  const [reactionsSummary, setReactionsSummary] = useState(post.reactionsSummary);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderateAction, setModerateAction] = useState<'HIDE' | 'MODERATE' | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isOwner = post.user.id === user?.id;

  async function handleReact(emoji: ReactionEmojiCode) {
    const previousReaction = myReaction;
    const previousSummary = reactionsSummary;

    setMyReaction(emoji);
    setReactionsSummary(applyReactionLocally(previousSummary, previousReaction, emoji));

    try {
      await api.post(`/posts/${post.id}/reactions`, { emoji });
    } catch {
      setMyReaction(previousReaction);
      setReactionsSummary(previousSummary);
      showToast('Não foi possível registrar sua reação.', 'error');
    }
  }

  async function handleRemoveReaction() {
    const previousReaction = myReaction;
    const previousSummary = reactionsSummary;

    setMyReaction(null);
    setReactionsSummary(applyReactionLocally(previousSummary, previousReaction, null));

    try {
      await api.delete(`/posts/${post.id}/reactions`);
    } catch {
      setMyReaction(previousReaction);
      setReactionsSummary(previousSummary);
      showToast('Não foi possível remover sua reação.', 'error');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/posts/${post.id}`);
      showToast('Publicação excluída.', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir a publicação.', 'error');
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await api.post(`/posts/${post.id}/moderate`, { action: 'RESTORE' });
      showToast('Publicação restaurada — voltou a ficar visível pra todos.', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível restaurar a publicação.', 'error');
    } finally {
      setRestoring(false);
      setConfirmRestoreOpen(false);
    }
  }

  return (
    <article className="post-card">
      <header className="post-card__header">
        <Avatar name={post.user.name} avatarType={post.user.avatarType} avatarUrl={post.user.avatarUrl} userId={post.user.id} />
        <div>
          <div className="post-card__author">{post.user.name}</div>
          <time className="post-card__date">{new Date(post.createdAt).toLocaleString('pt-BR')}</time>
        </div>
        {post.status !== 'PUBLISHED' && (
          <span className="badge badge--warning">{MODERATION_STATUS_LABELS[post.status] ?? post.status}</span>
        )}
        <div className="table__actions" style={{ marginLeft: 'auto' }}>
          {isAdmin && post.status === 'PUBLISHED' && (
            <>
              <button type="button" className="post-card__delete" aria-label="Ocultar publicação" title="Ocultar" onClick={() => setModerateAction('HIDE')}>
                🙈
              </button>
              <button type="button" className="post-card__delete" aria-label="Moderar publicação" title="Moderar" onClick={() => setModerateAction('MODERATE')}>
                ⚠️
              </button>
            </>
          )}
          {isAdmin && post.status !== 'PUBLISHED' && (
            <button type="button" className="post-card__delete" aria-label="Restaurar publicação" title="Restaurar" onClick={() => setConfirmRestoreOpen(true)}>
              ♻️
            </button>
          )}
          {(isOwner || isAdmin) && (
            <button type="button" className="post-card__delete" aria-label="Excluir publicação" title="Excluir" onClick={() => setConfirmDeleteOpen(true)}>
              🗑️
            </button>
          )}
        </div>
      </header>

      {post.activity && (
        <div className="post-card__activity">
          <span className="post-card__activity-badge">✅ Atividade registrada</span>
          <div className="post-card__activity-details">
            <span className="post-card__activity-modality">
              {emojiForIcon(post.activity.icon ?? '')} {post.activity.modality}
              {' · '}
              {post.activity.quantity}
              {post.activity.unit ? ` ${post.activity.unit}` : ''}
            </span>
            <span className="post-card__activity-points">+{post.activity.points} pontos</span>
          </div>
        </div>
      )}

      <p className="post-card__content">{post.content}</p>

      {post.hasImage && (
        <div className="post-card__image-wrap">
          {imageLoading ? (
            <LoadingState label="Carregando foto…" />
          ) : imageUrl ? (
            <button type="button" className="post-card__image-button" onClick={() => setLightboxOpen(true)} aria-label="Ver foto em tamanho grande">
              <img src={imageUrl} alt="Foto da publicação" className="post-card__image" />
            </button>
          ) : null}
        </div>
      )}

      {lightboxOpen && imageUrl && (
        <ImageLightbox src={imageUrl} alt="Foto da publicação" onClose={() => setLightboxOpen(false)} />
      )}

      <footer className="post-card__footer">
        <ReactionPicker reactionsSummary={reactionsSummary} myReaction={myReaction} onReact={handleReact} onRemove={handleRemoveReaction} />
        <button type="button" className="post-card__action" onClick={() => setCommentsOpen((v) => !v)}>
          💬 {post.commentsCount}
        </button>
      </footer>

      {commentsOpen && <CommentsSection postId={post.id} />}

      {confirmDeleteOpen && (
        <ConfirmModal
          title="Excluir publicação"
          message={
            isOwner
              ? 'Tem certeza que deseja excluir esta publicação? Essa ação não pode ser desfeita.'
              : `Tem certeza que deseja excluir a publicação de ${post.user.name}? Essa ação não pode ser desfeita e fica registrada na auditoria.`
          }
          confirmLabel="Excluir"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}

      {confirmRestoreOpen && (
        <ConfirmModal
          title="Restaurar publicação"
          message={`Restaurar a publicação de ${post.user.name}? Ela volta a ficar visível pra todo mundo no mural.`}
          confirmLabel="Restaurar"
          loading={restoring}
          onConfirm={handleRestore}
          onCancel={() => setConfirmRestoreOpen(false)}
        />
      )}

      {moderateAction && (
        <ModerateModal
          postId={post.id}
          action={moderateAction}
          authorName={post.user.name}
          onClose={() => setModerateAction(null)}
          onModerated={() => {
            setModerateAction(null);
            onChanged();
          }}
        />
      )}
    </article>
  );
}

function ModerateModal({
  postId,
  action,
  authorName,
  onClose,
  onModerated,
}: {
  postId: string;
  action: 'HIDE' | 'MODERATE';
  authorName: string;
  onClose: () => void;
  onModerated: () => void;
}) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = action === 'HIDE' ? 'Ocultar publicação' : 'Moderar publicação';
  const confirmLabel = action === 'HIDE' ? 'Ocultar' : 'Moderar';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      setError('O motivo, se informado, precisa ter pelo menos 5 caracteres.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/posts/${postId}/moderate`, { action, reason: trimmed || undefined });
      showToast(action === 'HIDE' ? 'Publicação ocultada.' : 'Publicação moderada.', 'success');
      onModerated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível concluir a moderação.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}
        <p className="steps-list__description" style={{ marginTop: 0 }}>
          {action === 'HIDE'
            ? `A publicação de ${authorName} deixa de aparecer pra outras pessoas — só ${authorName} e admins continuam vendo.`
            : `A publicação de ${authorName} é marcada como moderada (mesmo efeito de visibilidade de ocultar, mas sinaliza uma violação de conduta, não só uma remoção de rotina).`}
        </p>
        <label className="field">
          <span className="field__label">Motivo (opcional)</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Por que esta publicação está sendo removida da visibilidade pública?" />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CommentsSection({ postId }: { postId: string }) {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .get<Comment[]>(`/posts/${postId}/comments?limit=50`)
      .then(({ data }) => setComments(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [postId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/posts/${postId}/comments`, { content: text.trim() });
      setText('');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível comentar.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setDeletingId(commentId);
    try {
      await api.delete(`/posts/${postId}/comments/${commentId}`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir o comentário.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="comments">
      {loading ? (
        <LoadingState label="Carregando comentários…" />
      ) : (
        <ul className="comments__list">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              postId={postId}
              comment={c}
              canDelete={c.user.id === user?.id || isAdmin}
              deleting={deletingId === c.id}
              onDelete={() => handleDeleteComment(c.id)}
            />
          ))}
          {comments.length === 0 && <li className="comments__empty">Nenhum comentário ainda.</li>}
        </ul>
      )}
      <form className="comments__form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Escreva um comentário…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn--small btn--primary" disabled={submitting || !text.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}

function CommentItem({
  postId,
  comment,
  canDelete,
  deleting,
  onDelete,
}: {
  postId: string;
  comment: Comment;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { showToast } = useToast();
  const [myReaction, setMyReaction] = useState(comment.myReaction);
  const [reactionsSummary, setReactionsSummary] = useState(comment.reactionsSummary);

  async function handleReact(emoji: ReactionEmojiCode) {
    const previousReaction = myReaction;
    const previousSummary = reactionsSummary;

    setMyReaction(emoji);
    setReactionsSummary(applyReactionLocally(previousSummary, previousReaction, emoji));

    try {
      await api.post(`/posts/${postId}/comments/${comment.id}/reactions`, { emoji });
    } catch {
      setMyReaction(previousReaction);
      setReactionsSummary(previousSummary);
      showToast('Não foi possível registrar sua reação.', 'error');
    }
  }

  async function handleRemoveReaction() {
    const previousReaction = myReaction;
    const previousSummary = reactionsSummary;

    setMyReaction(null);
    setReactionsSummary(applyReactionLocally(previousSummary, previousReaction, null));

    try {
      await api.delete(`/posts/${postId}/comments/${comment.id}/reactions`);
    } catch {
      setMyReaction(previousReaction);
      setReactionsSummary(previousSummary);
      showToast('Não foi possível remover sua reação.', 'error');
    }
  }

  return (
    <li className="comments__item">
      <Avatar name={comment.user.name} avatarType={comment.user.avatarType} avatarUrl={comment.user.avatarUrl} userId={comment.user.id} size={28} />
      <div style={{ flex: 1 }}>
        <span className="comments__author">{comment.user.name}</span>
        <p className="comments__text">{comment.content}</p>
        <div className="comments__reactions">
          <ReactionPicker reactionsSummary={reactionsSummary} myReaction={myReaction} onReact={handleReact} onRemove={handleRemoveReaction} />
        </div>
      </div>
      {canDelete && (
        <button
          type="button"
          className="post-card__delete"
          aria-label="Excluir comentário"
          title="Excluir comentário"
          disabled={deleting}
          onClick={onDelete}
        >
          🗑️
        </button>
      )}
    </li>
  );
}

function ComposerModal({ eventId, onClose, onCreated }: { eventId: string | null; onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('content', content.trim());
      if (eventId) formData.append('eventId', eventId);
      if (file) formData.append('file', file);
      await api.post('/posts', formData, true);
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível publicar.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={eventId ? 'Nova publicação no grupo' : 'Nova publicação'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}
        <label className="field">
          <span className="field__label">O que você quer compartilhar?</span>
          <textarea rows={4} required maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Foto (opcional)</span>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting || !content.trim()}>
            {submitting ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
