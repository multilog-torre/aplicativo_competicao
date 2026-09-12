import { MouseEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { NotificationItem } from '../../types/api';
import { useToast } from '../../context/ToastContext';
import { LoadingState, EmptyState } from './States';
import { TrashIcon } from './icons';

const POLL_INTERVAL_MS = 20000;

/** "há 5 min", "há 2h", "há 3 dias"… cai pra data completa depois de uma semana. */
function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days === 1 ? '' : 's'}`;
  return new Date(isoDate).toLocaleDateString('pt-BR');
}

/**
 * Central de notificações: sino no topbar com contador de não lidas, que
 * abre um painel com a lista completa. Clicar numa notificação marca como
 * lida; cada uma tem um botão de excluir. Sem WebSocket no projeto, o
 * contador é atualizado por polling (mesmo padrão do AchievementUnlockWatcher).
 */
export function NotificationBell() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  function loadUnreadCount() {
    api
      .get<{ count: number }>('/notifications/unread-count')
      .then(({ data }) => setUnreadCount(data.count))
      .catch(() => undefined);
  }

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function loadList() {
    setLoading(true);
    api
      .get<NotificationItem[]>('/notifications?limit=30')
      .then(({ data }) => setItems(data))
      .catch(() => showToast('Não foi possível carregar as notificações.', 'error'))
      .finally(() => setLoading(false));
  }

  function openPanel() {
    setOpen(true);
    loadList();
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function handleOpenNotification(n: NotificationItem) {
    if (n.isRead) return;
    // Otimista: marca na tela na hora, sem esperar a resposta — o próximo
    // polling do contador corrige sozinho se a chamada abaixo falhar.
    setItems((prev) => prev?.map((it) => (it.id === n.id ? { ...it, isRead: true } : it)) ?? prev);
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.post(`/notifications/${n.id}/read`);
    } catch {
      // falha pontual — não vale a pena incomodar com um toast por isso
    }
  }

  async function handleMarkAllRead() {
    if (!items || items.every((n) => n.isRead)) return;
    const previous = items;
    setItems(items.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await api.post('/notifications/read-all');
    } catch (err) {
      setItems(previous);
      showToast(err instanceof ApiError ? err.message : 'Não foi possível marcar todas como lidas.', 'error');
      loadUnreadCount();
    }
  }

  async function handleDelete(n: NotificationItem, e: MouseEvent) {
    e.stopPropagation();
    const previous = items;
    setItems((prev) => prev?.filter((it) => it.id !== n.id) ?? prev);
    if (!n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.delete(`/notifications/${n.id}`);
    } catch (err) {
      setItems(previous ?? null);
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir a notificação.', 'error');
      loadUnreadCount();
    }
  }

  return (
    <>
      <button
        type="button"
        className="notification-bell"
        aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lida(s)` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPanel}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-drawer-overlay" onClick={() => setOpen(false)}>
          <div
            className="notification-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Notificações"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notification-drawer-panel__header">
              <h2>Notificações</h2>
              <button type="button" className="notification-drawer-panel__close" aria-label="Fechar notificações" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="notification-drawer-panel__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={handleMarkAllRead}
                disabled={!items || items.length === 0 || items.every((n) => n.isRead)}
              >
                Marcar todas como lidas
              </button>
            </div>

            <div className="notification-drawer-panel__body">
              {loading && <LoadingState label="Carregando notificações…" />}
              {!loading && items && items.length === 0 && <EmptyState icon="🔔" title="Nenhuma notificação por aqui" />}
              {!loading && items && items.length > 0 && (
                <ul className="notification-list">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={`notification-item ${n.isRead ? '' : 'notification-item--unread'}`}
                      onClick={() => handleOpenNotification(n)}
                    >
                      <span className="notification-item__dot" aria-hidden="true" />
                      <div className="notification-item__content">
                        <p className="notification-item__title">{n.title}</p>
                        <p className="notification-item__message">{n.message}</p>
                        <p className="notification-item__time">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                      <button
                        type="button"
                        className="notification-item__delete"
                        aria-label="Excluir notificação"
                        title="Excluir notificação"
                        onClick={(e) => handleDelete(n, e)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
