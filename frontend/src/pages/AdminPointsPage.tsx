import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PointsTransaction, RankingEntry } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  BONUS: 'Bônus',
  PENALTY: 'Penalidade',
  ADJUSTMENT: 'Ajuste',
  EVENT_BONUS: 'Bônus de evento',
};

export function AdminPointsPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<RankingEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [history, setHistory] = useState<PointsTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  function loadUsers(keepSelection = false) {
    api
      .get<RankingEntry[]>('/ranking?limit=100')
      .then(({ data }) => {
        setUsers(data);
        if (!keepSelection && data[0]) setSelectedUserId(data[0].userId);
      })
      .catch(() => showToast('Não foi possível carregar a lista de usuários.', 'error'))
      .finally(() => setLoadingUsers(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => loadUsers(), []);

  function loadHistory() {
    if (!selectedUserId) return;
    setLoadingHistory(true);
    setError(null);
    api
      // Diferente de /activities, /posts etc., este endpoint retorna o array
      // dentro de data.transactions (não data diretamente) — contrato já
      // estabelecido e testado nas Fases 5/19, mantido como está.
      .get<{ transactions: PointsTransaction[] }>(`/scoring/transactions?userId=${selectedUserId}&limit=15`)
      .then(({ data }) => setHistory(data.transactions))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o histórico.'))
      .finally(() => setLoadingHistory(false));
  }

  useEffect(loadHistory, [selectedUserId]);

  const selectedUser = users.find((u) => u.userId === selectedUserId);

  async function handleReverse(reason: string) {
    if (!reversingId) return;
    try {
      await api.post(`/scoring/transactions/${reversingId}/reverse`, { reason });
      showToast('Transação revertida com sucesso!', 'success');
      setReversingId(null);
      loadHistory();
      loadUsers(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível reverter a transação.', 'error');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Gerenciar Pontos</h1>

      {loadingUsers ? (
        <LoadingState label="Carregando usuários…" />
      ) : (
        <div className="card">
          <label className="field">
            <span className="field__label">Selecione um colaborador</span>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name} — {u.points.toLocaleString('pt-BR')} pts
                </option>
              ))}
            </select>
          </label>
          <div className="form__actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <button type="button" className="btn btn--primary" onClick={() => setManualFormOpen(true)} disabled={!selectedUserId}>
              + Lançar bônus / penalidade / ajuste
            </button>
          </div>
        </div>
      )}

      {selectedUser && (
        <section className="card">
          <h2 className="card__title">
            Histórico de {selectedUser.name} — total atual: {selectedUser.points.toLocaleString('pt-BR')} pts
          </h2>

          {loadingHistory && <LoadingState label="Carregando histórico…" />}
          {error && !loadingHistory && <ErrorState message={error} onRetry={loadHistory} />}
          {!loadingHistory && !error && history.length === 0 && <EmptyState icon="📜" title="Nenhuma transação registrada ainda" />}

          {!loadingHistory && !error && history.length > 0 && (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Origem</th>
                    <th>Descrição</th>
                    <th>Pontos</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx) => (
                    <tr key={tx.id}>
                      <td data-label="Data">{new Date(tx.createdAt).toLocaleString('pt-BR')}</td>
                      <td data-label="Origem">{TRANSACTION_TYPE_LABELS[tx.transactionType] ?? tx.transactionType}</td>
                      <td data-label="Descrição">{tx.description}</td>
                      <td data-label="Pontos" style={{ color: tx.points >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {tx.points >= 0 ? '+' : ''}
                        {tx.points}
                      </td>
                      <td data-label="Ações">
                        {tx.transactionType !== 'REVERSAL' && (
                          <button type="button" className="btn btn--small btn--danger" onClick={() => setReversingId(tx.id)}>
                            Reverter
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {manualFormOpen && selectedUser && (
        <ManualTransactionModal
          userId={selectedUser.userId}
          userName={selectedUser.name}
          onClose={() => setManualFormOpen(false)}
          onCreated={() => {
            setManualFormOpen(false);
            showToast('Lançamento realizado com sucesso!', 'success');
            loadHistory();
            loadUsers(true);
          }}
        />
      )}

      {reversingId && (
        <ReverseTransactionModal onCancel={() => setReversingId(null)} onConfirm={handleReverse} />
      )}
    </div>
  );
}

function ManualTransactionModal({
  userId,
  userName,
  onClose,
  onCreated,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showToast } = useToast();
  const [transactionType, setTransactionType] = useState('BONUS');
  const [points, setPoints] = useState('50');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 5) {
      setError('A descrição deve ter pelo menos 5 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/scoring/manual', {
        userId,
        transactionType,
        points: Number(points),
        description: description.trim(),
      });
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível lançar os pontos.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Lançamento manual — ${userName}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Tipo</span>
          <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
            <option value="BONUS">Bônus (soma pontos)</option>
            <option value="PENALTY">Penalidade (subtrai pontos)</option>
            <option value="ADJUSTMENT">Ajuste (pode somar ou subtrair)</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">
            Pontos {transactionType === 'PENALTY' ? '(informe um valor positivo — será subtraído automaticamente)' : ''}
          </span>
          <input type="number" required value={points} onChange={(e) => setPoints(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Motivo (mín. 5 caracteres)</span>
          <textarea rows={3} required minLength={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Confirmar lançamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReverseTransactionModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (reason.trim().length < 5) return;
    setSubmitting(true);
    await onConfirm(reason.trim());
    setSubmitting(false);
  }

  return (
    <Modal title="Reverter transação" onClose={onCancel}>
      <div className="form">
        <p>Isso cria uma transação de estorno — a transação original nunca é apagada.</p>
        <label className="field">
          <span className="field__label">Motivo da reversão (mín. 5 caracteres)</span>
          <textarea rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="btn btn--danger" onClick={handleConfirm} disabled={submitting || reason.trim().length < 5}>
            {submitting ? 'Revertendo…' : 'Confirmar reversão'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
