import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CommunityEvent, EventCategory, EventParticipantEntry } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { Avatar } from '../components/ui/Badge';
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
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
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

export function AdminEventsPage() {
  const { showToast } = useToast();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<CommunityEvent | null>(null);
  const [rejecting, setRejecting] = useState<CommunityEvent | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CommunityEvent | null>(null);
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

  async function handleCancel() {
    if (!cancelingId) return;
    setBusyId(cancelingId);
    try {
      await api.post(`/events/${cancelingId}/cancel`);
      showToast('Evento cancelado.', 'info');
      setCancelingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível cancelar o evento.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">🎉 Eventos</h1>
      </div>

      <p>
        Eventos propostos por colaboradores aparecem aqui como <strong>Pendente</strong>. Ao aprovar, você define
        quantos pontos de bônus o evento vale. Depois que a data passa, confirme quem realmente compareceu — só
        essas pessoas recebem o bônus.
      </p>

      {loading && <LoadingState label="Carregando eventos…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && events.length === 0 && <EmptyState icon="🎉" title="Nenhum evento cadastrado ainda" />}

      {!loading && !error && events.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Categoria</th>
                <th>Data</th>
                <th>Criado por</th>
                <th>Inscritos</th>
                <th>Bônus</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td data-label="Evento">{e.title}</td>
                  <td data-label="Categoria">{CATEGORY_LABELS[e.category]}</td>
                  <td data-label="Data">{formatDate(e.eventDate)}</td>
                  <td data-label="Criado por">{e.createdBy.name}</td>
                  <td data-label="Inscritos">{e.participantsCount}</td>
                  <td data-label="Bônus">{e.bonusPoints ?? '—'}</td>
                  <td data-label="Status">
                    <span className={`badge badge--${STATUS_TONE[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    {e.status === 'PENDING' && (
                      <>
                        <button type="button" className="btn btn--small btn--primary" onClick={() => setApproving(e)}>
                          Aprovar
                        </button>
                        <button type="button" className="btn btn--small btn--danger" onClick={() => setRejecting(e)}>
                          Rejeitar
                        </button>
                      </>
                    )}
                    {e.status === 'APPROVED' && !e.isPast && (
                      <button type="button" className="btn btn--small btn--danger" disabled={busyId === e.id} onClick={() => setCancelingId(e.id)}>
                        Cancelar
                      </button>
                    )}
                    {e.status === 'APPROVED' && e.isPast && (
                      <button type="button" className="btn btn--small btn--primary" onClick={() => setConfirming(e)}>
                        Confirmar presença
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approving && (
        <ApproveEventModal
          event={approving}
          onClose={() => setApproving(null)}
          onApproved={() => {
            setApproving(null);
            showToast('Evento aprovado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {rejecting && (
        <RejectEventModal
          event={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            showToast('Evento rejeitado.', 'info');
            load();
          }}
        />
      )}

      {confirming && (
        <ConfirmAttendanceModal
          event={confirming}
          onClose={() => setConfirming(null)}
          onConfirmed={() => {
            setConfirming(null);
            showToast('Presenças confirmadas e pontos creditados!', 'success');
            load();
          }}
        />
      )}

      {cancelingId && (
        <ConfirmModal
          title="Cancelar evento"
          message="Todos os inscritos serão avisados que o evento foi cancelado. Essa ação não pode ser desfeita."
          confirmLabel="Cancelar evento"
          danger
          loading={busyId === cancelingId}
          onConfirm={handleCancel}
          onCancel={() => setCancelingId(null)}
        />
      )}
    </div>
  );
}

function ApproveEventModal({ event, onClose, onApproved }: { event: CommunityEvent; onClose: () => void; onApproved: () => void }) {
  const { showToast } = useToast();
  const [bonusPoints, setBonusPoints] = useState('50');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/events/${event.id}/approve`, { bonusPoints: Number(bonusPoints) });
      onApproved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível aprovar o evento.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Aprovar — ${event.title}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}
        <p style={{ marginTop: 0 }}>{event.description}</p>
        <p className="steps-list__description" style={{ marginTop: 0 }}>
          📅 {formatDate(event.eventDate)} {event.location ? `· 📍 ${event.location}` : ''}
        </p>

        <label className="field">
          <span className="field__label">Pontos de bônus para quem participar</span>
          <input type="number" min="1" required value={bonusPoints} onChange={(e) => setBonusPoints(e.target.value)} />
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Aprovando…' : 'Aprovar evento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RejectEventModal({ event, onClose, onRejected }: { event: CommunityEvent; onClose: () => void; onRejected: () => void }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/events/${event.id}/reject`, { reason });
      onRejected();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível rejeitar o evento.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Rejeitar — ${event.title}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Motivo (visível para quem propôs o evento)</span>
          <textarea rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--danger" disabled={submitting}>
            {submitting ? 'Rejeitando…' : 'Rejeitar evento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmAttendanceModal({ event, onClose, onConfirmed }: { event: CommunityEvent; onClose: () => void; onConfirmed: () => void }) {
  const { showToast } = useToast();
  const [participants, setParticipants] = useState<EventParticipantEntry[] | null>(null);
  const [attended, setAttended] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EventParticipantEntry[]>(`/events/${event.id}/participants`)
      .then(({ data }) => setParticipants(data))
      .catch(() => setError('Não foi possível carregar os inscritos.'))
      .finally(() => setLoading(false));
  }, [event.id]);

  function toggle(userId: string) {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/events/${event.id}/confirm-attendance`, { attendedUserIds: Array.from(attended) });
      onConfirmed();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível confirmar as presenças.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Confirmar presença — ${event.title}`} onClose={onClose}>
      {loading ? (
        <LoadingState label="Carregando inscritos…" />
      ) : (
        <div className="form">
          {error && <div className="alert alert--error">{error}</div>}
          <p className="steps-list__description" style={{ marginTop: 0 }}>
            Marque quem realmente compareceu. Só essas pessoas recebem os {event.bonusPoints} pontos de bônus — quem
            não for marcado fica como ausente.
          </p>

          {!participants || participants.length === 0 ? (
            <EmptyState icon="👥" title="Nenhuma inscrição neste evento" />
          ) : (
            <ul className="ranking-list">
              {participants.map((p) => (
                <li key={p.id} className="ranking-row" style={{ gridTemplateColumns: 'auto auto 1fr auto' }}>
                  <input
                    type="checkbox"
                    checked={attended.has(p.user.id)}
                    onChange={() => toggle(p.user.id)}
                    aria-label={`Confirmar presença de ${p.user.name}`}
                  />
                  <Avatar name={p.user.name} avatarType={p.user.avatarType} avatarUrl={p.user.avatarUrl} userId={p.user.id} />
                  <div className="ranking-row__info">
                    <span className="ranking-row__name">{p.user.name}</span>
                    {p.user.department && <span className="ranking-row__department">{p.user.department.name}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="form__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" disabled={submitting || !participants?.length} onClick={handleSubmit}>
              {submitting ? 'Confirmando…' : 'Confirmar presenças e creditar pontos'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
