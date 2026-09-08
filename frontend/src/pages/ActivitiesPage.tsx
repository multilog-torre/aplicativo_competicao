import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ActivityType, UserActivity } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

export function ActivitiesPage() {
  const { showToast } = useToast();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<UserActivity[]>('/activities?limit=50')
      .then(({ data }) => setActivities(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar suas atividades.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Minhas Atividades</h1>
        <button type="button" className="btn btn--primary" onClick={() => setModalOpen(true)}>
          + Nova atividade
        </button>
      </div>

      {loading && <LoadingState label="Carregando suas atividades…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && activities.length === 0 && (
        <EmptyState icon="🏃" title="Nenhuma atividade registrada" description="Clique em “Nova atividade” para começar a pontuar." />
      )}

      {!loading && !error && activities.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Modalidade</th>
                <th>Quantidade</th>
                <th>Pontos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td data-label="Data">{new Date(a.activityDate).toLocaleDateString('pt-BR')}</td>
                  <td data-label="Modalidade">{a.activityType?.name}</td>
                  <td data-label="Quantidade">
                    {a.quantity}
                    {a.unit ? ` ${a.unit}` : ''}
                  </td>
                  <td data-label="Pontos">+{a.calculatedPoints}</td>
                  <td data-label="Status">
                    <StatusBadge status={a.status} />
                    {a.status === 'REJECTED' && a.rejectionReason && (
                      <span className="table__hint" title={a.rejectionReason}>
                        ⓘ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NewActivityModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            showToast('Atividade registrada com sucesso! Aguarde a aprovação.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function NewActivityModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [activityTypeId, setActivityTypeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ActivityType[]>('/activity-types?status=ACTIVE')
      .then(({ data }) => {
        setTypes(data);
        if (data[0]) setActivityTypeId(data[0].id);
      })
      .catch(() => setFormError('Não foi possível carregar as modalidades.'))
      .finally(() => setLoadingTypes(false));
  }, []);

  const selectedType = types.find((t) => t.id === activityTypeId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (selectedType?.requiresEvidence && !file) {
      setFormError('Esta modalidade exige o envio de uma evidência (foto/comprovante).');
      return;
    }

    setSubmitting(true);
    try {
      const { data: activity } = await api.post<{ id: string }>('/activities', {
        activityTypeId,
        activityDate: new Date(activityDate).toISOString(),
        quantity: Number(quantity),
        description: description || undefined,
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/activities/${activity.id}/evidence`, formData, true);
      }

      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível registrar a atividade.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nova atividade" onClose={onClose}>
      {loadingTypes ? (
        <LoadingState label="Carregando modalidades…" />
      ) : (
        <form onSubmit={handleSubmit} className="form">
          {formError && <div className="alert alert--error">{formError}</div>}

          <label className="field">
            <span className="field__label">Modalidade</span>
            <select value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className="form__row">
            <label className="field">
              <span className="field__label">Quantidade{selectedType?.unit ? ` (${selectedType.unit})` : ''}</span>
              <input type="number" min="0.01" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Data</span>
              <input type="date" required value={activityDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setActivityDate(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Descrição (opcional)</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </label>

          <label className="field">
            <span className="field__label">
              Evidência {selectedType?.requiresEvidence ? '(obrigatória para esta modalidade)' : '(opcional)'}
            </span>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="form__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Registrar atividade'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
