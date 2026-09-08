import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuthedImage } from '../api/useAuthedImage';
import { Comment, Post } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Avatar } from '../components/ui/Badge';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function MuralPage() {
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<Post[]>('/posts?limit=30')
      .then(({ data }) => setPosts(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o mural.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Mural</h1>
        <button type="button" className="btn btn--primary" onClick={() => setComposerOpen(true)}>
          + Nova publicação
        </button>
      </div>

      {loading && <LoadingState label="Carregando o mural…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && posts.length === 0 && (
        <EmptyState icon="📣" title="Nenhuma publicação ainda" description="Seja o primeiro a compartilhar algo com a equipe!" />
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
          onClose={() => setComposerOpen(false)}
          onCreated={() => {
            setComposerOpen(false);
            showToast('Publicação criada com sucesso!', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function PostCard({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { url: imageUrl, loading: imageLoading } = useAuthedImage(post.hasImage ? post.imageDownloadUrl : null);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikesCount((c) => c + (next ? 1 : -1));
    try {
      if (next) await api.post(`/posts/${post.id}/like`);
      else await api.delete(`/posts/${post.id}/like`);
    } catch {
      setLiked(!next);
      setLikesCount((c) => c + (next ? -1 : 1));
      showToast('Não foi possível registrar sua curtida.', 'error');
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

  return (
    <article className="post-card">
      <header className="post-card__header">
        <Avatar name={post.user.name} avatarType={post.user.avatarType} avatarUrl={post.user.avatarUrl} userId={post.user.id} />
        <div>
          <div className="post-card__author">{post.user.name}</div>
          <time className="post-card__date">{new Date(post.createdAt).toLocaleString('pt-BR')}</time>
        </div>
        {post.user.id === user?.id && (
          <button type="button" className="post-card__delete" aria-label="Excluir publicação" onClick={() => setConfirmDeleteOpen(true)}>
            🗑️
          </button>
        )}
      </header>

      <p className="post-card__content">{post.content}</p>

      {post.hasImage && (
        <div className="post-card__image-wrap">
          {imageLoading ? <LoadingState label="Carregando foto…" /> : imageUrl ? <img src={imageUrl} alt="Foto da publicação" className="post-card__image" /> : null}
        </div>
      )}

      <footer className="post-card__footer">
        <button type="button" className={`post-card__action ${liked ? 'post-card__action--active' : ''}`} onClick={toggleLike}>
          {liked ? '❤️' : '🤍'} {likesCount}
        </button>
        <button type="button" className="post-card__action" onClick={() => setCommentsOpen((v) => !v)}>
          💬 {post.commentsCount}
        </button>
      </footer>

      {commentsOpen && <CommentsSection postId={post.id} />}

      {confirmDeleteOpen && (
        <ConfirmModal
          title="Excluir publicação"
          message="Tem certeza que deseja excluir esta publicação? Essa ação não pode ser desfeita."
          confirmLabel="Excluir"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </article>
  );
}

function CommentsSection({ postId }: { postId: string }) {
  const { showToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="comments">
      {loading ? (
        <LoadingState label="Carregando comentários…" />
      ) : (
        <ul className="comments__list">
          {comments.map((c) => (
            <li key={c.id} className="comments__item">
              <Avatar name={c.user.name} avatarType={c.user.avatarType} avatarUrl={c.user.avatarUrl} userId={c.user.id} size={28} />
              <div>
                <span className="comments__author">{c.user.name}</span>
                <p className="comments__text">{c.content}</p>
              </div>
            </li>
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

function ComposerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    <Modal title="Nova publicação" onClose={onClose}>
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
