import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AwardCycle, CycleEffectiveStatus } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { Avatar } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';

const STATUS_LABELS: Record<CycleEffectiveStatus, string> = {
  UPCOMING: 'Ainda não começou',
  ACTIVE: 'Em andamento',
  COMPLETED: 'Aguardando encerramento',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGE_TONE: Record<CycleEffectiveStatus, string> = {
  UPCOMING: 'neutral',
  ACTIVE: 'success',
  COMPLETED: 'warning',
  CLOSED: 'neutral',
  CANCELLED: 'danger',
};

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function toDateTimeInputValue(iso: string): string {
  // <input type="datetime-local"> espera "YYYY-MM-DDTHH:mm", sem fuso/segundos.
  return new Date(iso).toISOString().slice(0, 16);
}

export function AdminCyclesPage() {
  const { showToast } = useToast();
  const [cycles, setCycles] = useState<AwardCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AwardCycle | null>(null);
  const [editingPrizes, setEditingPrizes] = useState<AwardCycle | null>(null);
  const [viewingPodium, setViewingPodium] = useState<AwardCycle | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<AwardCycle[]>('/cycles?limit=100')
      .then(({ data }) => setCycles(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os ciclos.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCancel() {
    if (!cancelingId) return;
    setBusyId(cancelingId);
    try {
      await api.post(`/cycles/${cancelingId}/cancel`);
      showToast('Ciclo cancelado.', 'info');
      setCancelingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível cancelar o ciclo.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setBusyId(deletingId);
    try {
      const { data } = await api.delete<{ message: string }>(`/cycles/${deletingId}`);
      showToast(data.message, 'success');
      setDeletingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir o ciclo.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Ciclos de Premiação</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Novo ciclo
        </button>
      </div>

      <p>
        Cada ciclo é uma competição com data início/fim. Ao passar a data fim, o sistema encerra o ciclo
        automaticamente: calcula o pódio (1º/2º/3º) e <strong>zera a pontuação de todos os colaboradores</strong> —
        sem apagar o histórico, tudo continua auditável. Conquistas nunca são resetadas.
      </p>

      {loading && <LoadingState label="Carregando ciclos…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && cycles.length === 0 && <EmptyState icon="🏆" title="Nenhum ciclo cadastrado ainda" />}

      {!loading && !error && cycles.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nome">{c.name}</td>
                  <td data-label="Início">{new Date(c.startDate).toLocaleDateString('pt-BR')}</td>
                  <td data-label="Fim">{new Date(c.endDate).toLocaleDateString('pt-BR')}</td>
                  <td data-label="Status">
                    <span className={`badge badge--${STATUS_BADGE_TONE[c.effectiveStatus]}`}>{STATUS_LABELS[c.effectiveStatus]}</span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    {c.effectiveStatus === 'CLOSED' && (
                      <button type="button" className="btn btn--small btn--secondary" onClick={() => setViewingPodium(c)}>
                        Ver pódio
                      </button>
                    )}
                    {(c.effectiveStatus === 'UPCOMING' || c.effectiveStatus === 'ACTIVE') && (
                      <>
                        {c.effectiveStatus === 'UPCOMING' && (
                          <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(c)}>
                            Editar
                          </button>
                        )}
                        <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditingPrizes(c)}>
                          Prêmios
                        </button>
                        <button
                          type="button"
                          className="btn btn--small btn--danger"
                          disabled={busyId === c.id}
                          onClick={() => setCancelingId(c.id)}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {c.effectiveStatus === 'UPCOMING' && (
                      <button type="button" className="btn btn--small btn--danger" disabled={busyId === c.id} onClick={() => setDeletingId(c.id)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CycleFormModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            showToast('Ciclo criado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {editing && (
        <CycleFormModal
          cycle={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast('Ciclo atualizado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {editingPrizes && (
        <PrizesModal
          cycle={editingPrizes}
          onClose={() => setEditingPrizes(null)}
          onSaved={() => {
            setEditingPrizes(null);
            showToast('Prêmios atualizados com sucesso!', 'success');
            load();
          }}
        />
      )}

      {viewingPodium && <PodiumModal cycle={viewingPodium} onClose={() => setViewingPodium(null)} />}

      {cancelingId && (
        <ConfirmModal
          title="Cancelar ciclo"
          message="O ciclo será interrompido sem calcular pódio nem resetar a pontuação de ninguém. Os pontos ganhos durante ele continuam contando para o próximo ciclo."
          confirmLabel="Cancelar ciclo"
          danger
          loading={busyId === cancelingId}
          onConfirm={handleCancel}
          onCancel={() => setCancelingId(null)}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir ciclo"
          message="Só é possível excluir um ciclo que ainda não começou. Essa ação não pode ser desfeita."
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

function CycleFormModal({ cycle, onClose, onSaved }: { cycle?: AwardCycle; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const isEditing = !!cycle;
  const [name, setName] = useState(cycle?.name ?? '');
  const [startDate, setStartDate] = useState(cycle ? toDateTimeInputValue(cycle.startDate) : '');
  const [endDate, setEndDate] = useState(cycle ? toDateTimeInputValue(cycle.endDate) : '');
  const [prize1, setPrize1] = useState('');
  const [prize2, setPrize2] = useState('');
  const [prize3, setPrize3] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEditing) {
        await api.patch(`/cycles/${cycle!.id}`, { name, startDate, endDate });
      } else {
        const prizes = [
          prize1.trim() ? { position: 1, title: prize1.trim() } : null,
          prize2.trim() ? { position: 2, title: prize2.trim() } : null,
          prize3.trim() ? { position: 3, title: prize3.trim() } : null,
        ].filter((p): p is { position: number; title: string } => p !== null);
        await api.post('/cycles', { name, startDate, endDate, prizes });
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar o ciclo.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Editar ciclo' : 'Novo ciclo de premiação'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Nome do ciclo</span>
          <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ciclo Setembro/2026" />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Data/hora de início</span>
            <input type="datetime-local" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Data/hora de fim</span>
            <input type="datetime-local" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        {!isEditing && (
          <fieldset className="field">
            <legend className="field__label">Prêmios (opcional — pode configurar depois)</legend>
            <label className="field">
              <span className="field__label">🥇 1º lugar</span>
              <input type="text" value={prize1} onChange={(e) => setPrize1(e.target.value)} placeholder="Ex.: Vale-compras R$300" />
            </label>
            <label className="field">
              <span className="field__label">🥈 2º lugar</span>
              <input type="text" value={prize2} onChange={(e) => setPrize2(e.target.value)} placeholder="Ex.: Fone de ouvido Bluetooth" />
            </label>
            <label className="field">
              <span className="field__label">🥉 3º lugar</span>
              <input type="text" value={prize3} onChange={(e) => setPrize3(e.target.value)} placeholder="Ex.: Camiseta Dry-Fit" />
            </label>
          </fieldset>
        )}

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar ciclo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrizesModal({ cycle, onClose, onSaved }: { cycle: AwardCycle; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [savingPosition, setSavingPosition] = useState<number | null>(null);

  async function savePrize(position: 1 | 2 | 3, title: string, description: string) {
    if (!title.trim()) {
      showToast('Informe um título para o prêmio.', 'error');
      return;
    }
    setSavingPosition(position);
    try {
      await api.put(`/cycles/${cycle.id}/prizes`, { position, title: title.trim(), description: description.trim() || undefined });
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível salvar o prêmio.', 'error');
    } finally {
      setSavingPosition(null);
    }
  }

  return (
    <Modal title={`Prêmios — ${cycle.name}`} onClose={onClose}>
      <div className="form">
        {[1, 2, 3].map((position) => {
          const existing = cycle.prizes.find((p) => p.position === position);
          return (
            <PrizeRow
              key={position}
              position={position as 1 | 2 | 3}
              initialTitle={existing?.title ?? ''}
              initialDescription={existing?.description ?? ''}
              saving={savingPosition === position}
              onSave={savePrize}
            />
          );
        })}
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PrizeRow({
  position,
  initialTitle,
  initialDescription,
  saving,
  onSave,
}: {
  position: 1 | 2 | 3;
  initialTitle: string;
  initialDescription: string;
  saving: boolean;
  onSave: (position: 1 | 2 | 3, title: string, description: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  return (
    <fieldset className="field">
      <legend className="field__label">
        {MEDALS[position]} {position}º lugar
      </legend>
      <div className="form__row">
        <label className="field">
          <span className="field__label">Título</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Vale-compras R$300" />
        </label>
        <label className="field">
          <span className="field__label">Descrição (opcional)</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn--small btn--primary" disabled={saving} onClick={() => onSave(position, title, description)}>
        {saving ? 'Salvando…' : 'Salvar este prêmio'}
      </button>
    </fieldset>
  );
}

function PodiumModal({ cycle, onClose }: { cycle: AwardCycle; onClose: () => void }) {
  const prizeByPosition = new Map(cycle.prizes.map((p) => [p.position, p]));

  return (
    <Modal title={`Pódio — ${cycle.name}`} onClose={onClose}>
      {cycle.winners.length === 0 ? (
        <p>Nenhum vencedor registrado (ninguém pontuou durante este ciclo).</p>
      ) : (
        <ul className="ranking-list">
          {cycle.winners.map((w) => (
            <li key={w.id} className="ranking-row">
              <span className="ranking-row__position">{MEDALS[w.position] ?? `${w.position}º`}</span>
              <Avatar name={w.user.name} avatarType={w.user.avatarType} avatarUrl={w.user.avatarUrl} userId={w.user.id} />
              <div className="ranking-row__info">
                <span className="ranking-row__name">{w.user.name}</span>
                {prizeByPosition.get(w.position) && <span className="ranking-row__department">🎁 {prizeByPosition.get(w.position)?.title}</span>}
              </div>
              <span className="ranking-row__points">{w.pointsAtClose.toLocaleString('pt-BR')} pts</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
