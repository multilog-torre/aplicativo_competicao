import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CommunityEvent, EventCategory } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  CORRIDA: '🏃 Corrida',
  CAMINHADA: '🚶 Caminhada',
  CICLISMO: '🚴 Ciclismo',
  ACADEMIA: '🏋️ Academia',
  ESPORTE_COLETIVO: '⚽ Esporte coletivo',
  OUTRO: '🎯 Outro',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aberto',
  REJECTED: 'Não aprovado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Encerrado',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'neutral',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EventsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<CommunityEvent[]>('/events')
      .then(({ data }) => setEvents(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os eventos.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleJoin(eventId: string) {
    setBusyId(eventId);
    try {
      await api.post(`/events/${eventId}/join`);
      showToast('Inscrição confirmada! Seu bônus é creditado depois que o admin confirmar sua presença no evento.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível se inscrever.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeave(eventId: string) {
    setBusyId(eventId);
    try {
      await api.post(`/events/${eventId}/leave`);
      showToast('Inscrição cancelada.', 'info');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível cancelar a inscrição.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setBusyId(deletingId);
    try {
      await api.delete(`/events/${deletingId}`);
      showToast('Evento excluído.', 'info');
      setDeletingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir o evento.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const openEvents = events.filter((e) => e.status === 'APPROVED');
  const myOwnPending = events.filter((e) => e.createdBy.id === user?.id && ['PENDING', 'REJECTED'].includes(e.status));
  const pastEvents = events.filter((e) => e.status === 'COMPLETED' || e.status === 'CANCELLED');

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">🎉 Eventos</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Propor evento
        </button>
      </div>

      <p>
        Qualquer colaborador pode propor um evento (corrida, academia, etc.). Depois que um administrador aprovar e
        definir a pontuação de bônus, o evento fica aberto para inscrições. O bônus é creditado depois que o evento
        acontece, quando o admin confirma quem participou.
      </p>

      {loading && <LoadingState label="Carregando eventos…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {myOwnPending.length > 0 && (
            <section className="card">
              <h2 className="card__title">Seus eventos propostos</h2>
              <ul className="ranking-list">
                {myOwnPending.map((e) => (
                  <li key={e.id} className="ranking-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div className="ranking-row__info">
                      <span className="ranking-row__name">
                        {CATEGORY_LABELS[e.category]} — {e.title}
                      </span>
                      <span className="ranking-row__department">
                        {formatDate(e.eventDate)}
                        {e.status === 'REJECTED' && e.rejectionReason ? ` · Motivo: ${e.rejectionReason}` : ''}
                      </span>
                    </div>
                    <div className="table__actions">
                      <span className={`badge badge--${STATUS_TONE[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                      {e.status === 'PENDING' && (
                        <button type="button" className="btn btn--small btn--danger" disabled={busyId === e.id} onClick={() => setDeletingId(e.id)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="card__title">Eventos abertos</h2>
            {openEvents.length === 0 ? (
              <EmptyState icon="🎉" title="Nenhum evento aberto no momento" description="Que tal propor um?" />
            ) : (
              <div className="event-grid">
                {openEvents.map((e) => (
                  <EventCard key={e.id} event={e} busy={busyId === e.id} onJoin={() => handleJoin(e.id)} onLeave={() => handleLeave(e.id)} />
                ))}
              </div>
            )}
          </section>

          {pastEvents.length > 0 && (
            <section className="card">
              <h2 className="card__title">Eventos encerrados</h2>
              <ul className="ranking-list">
                {pastEvents.map((e) => (
                  <li key={e.id} className="ranking-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div className="ranking-row__info">
                      <span className="ranking-row__name">
                        {CATEGORY_LABELS[e.category]} — {e.title}
                      </span>
                      <span className="ranking-row__department">{formatDate(e.eventDate)}</span>
                    </div>
                    <div className="table__actions">
                      {e.status === 'COMPLETED' && e.myParticipationStatus === 'ATTENDED' && (
                        <span className="badge badge--success">+{e.bonusPoints} pts creditados</span>
                      )}
                      {e.status === 'COMPLETED' && e.myParticipationStatus === 'NO_SHOW' && (
                        <span className="badge badge--neutral">Ausente</span>
                      )}
                      <span className={`badge badge--${STATUS_TONE[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {creating && (
        <CreateEventModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            showToast('Evento proposto com sucesso! Aguarde a aprovação do administrador.', 'success');
            load();
          }}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir evento"
          message="Só é possível excluir um evento que ainda está aguardando aprovação. Essa ação não pode ser desfeita."
          confirmLabel="Excluir"
          danger
          loading={busyId === deletingId}
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function EventCard({
  event,
  busy,
  onJoin,
  onLeave,
}: {
  event: CommunityEvent;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="event-card">
      <div className="event-card__header">
        <span className="badge badge--neutral">{CATEGORY_LABELS[event.category]}</span>
        <span className="event-card__participants">👥 {event.participantsCount}</span>
      </div>
      <h3 className="event-card__title">{event.title}</h3>
      <p className="event-card__meta">
        📅 {formatDate(event.eventDate)}
        {event.location ? <> · 📍 {event.location}</> : null}
      </p>
      <p className="event-card__description">{event.description}</p>
      {event.bonusPoints && <p className="event-card__bonus">🎁 {event.bonusPoints} pontos de bônus por participar</p>}

      {event.myParticipationStatus === 'REGISTERED' ? (
        <button type="button" className="btn btn--secondary btn--block" disabled={busy} onClick={onLeave}>
          {busy ? 'Aguarde…' : 'Cancelar inscrição'}
        </button>
      ) : (
        <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={onJoin}>
          {busy ? 'Aguarde…' : 'Participar'}
        </button>
      )}
    </div>
  );
}

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('CORRIDA');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/events', {
        title,
        description,
        category,
        eventDate: new Date(eventDate).toISOString(),
        location: location || undefined,
      });
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível propor o evento.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Propor novo evento" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Título</span>
          <input type="text" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Corrida do Parque" />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Categoria</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Data e horário</span>
            <input type="datetime-local" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Local (opcional)</span>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Parque Ibirapuera, portão 3" />
        </label>

        <label className="field">
          <span className="field__label">Descrição</span>
          <textarea rows={3} required minLength={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <p className="steps-list__description" style={{ margin: 0 }}>
          A pontuação de bônus é definida pelo administrador quando aprovar o evento.
        </p>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Propor evento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
