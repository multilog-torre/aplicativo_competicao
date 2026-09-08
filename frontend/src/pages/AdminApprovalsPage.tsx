import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

interface PendingActivity {
  id: string;
  quantity: number;
  unit: string | null;
  calculatedPoints: number;
  activityDate: string;
  user: { name: string; corporateId: string | null };
  activityType: { name: string; requiresEvidence: boolean };
  _count: { evidences: number };
}

export function AdminApprovalsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<PendingActivity[]>('/admin/activities/pending?limit=50')
      .then(({ data }) => setItems(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as pendências.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleApprove(id: string) {
    setApprovingId(null);
    try {
      await api.post(`/admin/activities/${id}/approve`);
      showToast('Atividade aprovada com sucesso!', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível aprovar.', 'error');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Atividades Pendentes</h1>

      {loading && <LoadingState label="Carregando pendências…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState icon="✅" title="Nenhuma atividade pendente" description="Tudo em dia por aqui!" />}

      {!loading && !error && items.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Modalidade</th>
                <th>Quantidade</th>
                <th>Pontos</th>
                <th>Evidência</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Usuário">{item.user.name}</td>
                  <td data-label="Modalidade">{item.activityType.name}</td>
                  <td data-label="Quantidade">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </td>
                  <td data-label="Pontos">+{item.calculatedPoints}</td>
                  <td data-label="Evidência">{item._count.evidences > 0 ? `${item._count.evidences} arquivo(s)` : '—'}</td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--primary" onClick={() => setApprovingId(item.id)}>
                      Aprovar
                    </button>
                    <button type="button" className="btn btn--small btn--danger" onClick={() => setRejectingId(item.id)}>
                      Rejeitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approvingId && (
        <ConfirmModal
          title="Aprovar atividade"
          message="Confirma a aprovação desta atividade? Os pontos serão creditados imediatamente."
          confirmLabel="Aprovar"
          onConfirm={() => handleApprove(approvingId)}
          onCancel={() => setApprovingId(null)}
        />
      )}

      {rejectingId && (
        <RejectModal
          activityId={rejectingId}
          onClose={() => setRejectingId(null)}
          onRejected={() => {
            setRejectingId(null);
            showToast('Atividade rejeitada.', 'info');
            load();
          }}
        />
      )}
    </div>
  );
}

function RejectModal({ activityId, onClose, onRejected }: { activityId: string; onClose: () => void; onRejected: () => void }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/activities/${activityId}/reject`, { reason: reason.trim() });
      onRejected();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível rejeitar.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Rejeitar atividade" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        <label className="field">
          <span className="field__label">Motivo da rejeição (mín. 5 caracteres)</span>
          <textarea rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--danger" disabled={submitting || reason.trim().length < 5}>
            {submitting ? 'Enviando…' : 'Rejeitar atividade'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
