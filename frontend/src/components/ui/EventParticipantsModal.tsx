import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { EventParticipantEntry } from '../../types/api';
import { Avatar } from './Badge';
import { Modal } from './Modal';
import { LoadingState, EmptyState, ErrorState } from './States';

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: 'Inscrito',
  ATTENDED: 'Compareceu',
  NO_SHOW: 'Não compareceu',
};

const STATUS_TONE: Record<string, string> = {
  REGISTERED: 'neutral',
  ATTENDED: 'success',
  NO_SHOW: 'danger',
};

/** Lista de participantes de um evento — visível a qualquer usuário autenticado
 * (a pedido do usuário, não é mais exclusivo do admin). Usada tanto na tela
 * pública de Eventos quanto na administrativa. */
export function EventParticipantsModal({ eventId, eventTitle, onClose }: { eventId: string; eventTitle: string; onClose: () => void }) {
  const [participants, setParticipants] = useState<EventParticipantEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EventParticipantEntry[]>(`/events/${eventId}/participants`)
      .then(({ data }) => setParticipants(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os participantes.'));
  }, [eventId]);

  return (
    <Modal title={`Participantes — ${eventTitle}`} onClose={onClose}>
      {error && <ErrorState message={error} />}
      {!participants && !error && <LoadingState label="Carregando participantes…" />}
      {participants && participants.length === 0 && <EmptyState icon="👥" title="Ninguém inscrito ainda" />}
      {participants && participants.length > 0 && (
        <ul className="ranking-list">
          {participants.map((p) => (
            <li key={p.id} className="ranking-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
              <Avatar name={p.user.name} avatarType={p.user.avatarType} avatarUrl={p.user.avatarUrl} userId={p.user.id} />
              <div className="ranking-row__info">
                <span className="ranking-row__name">{p.user.name}</span>
                {p.user.department && <span className="ranking-row__department">{p.user.department.name}</span>}
              </div>
              <span className={`badge badge--${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
