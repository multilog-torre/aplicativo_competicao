import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ActivityType } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

const CATEGORIES = ['SPORTS', 'HEALTH', 'EDUCATION', 'SOCIAL', 'OTHER'];
const CATEGORY_LABELS: Record<string, string> = {
  SPORTS: 'Esportes',
  HEALTH: 'Saúde',
  EDUCATION: 'Educação',
  SOCIAL: 'Social',
  OTHER: 'Outra',
};
const SCORING_TYPES = ['FIXED', 'QUANTITY', 'TIME', 'MULTIPLIER'];
const SCORING_LABELS: Record<string, string> = {
  FIXED: 'Fixo (independe da quantidade)',
  QUANTITY: 'Por quantidade (ex.: pontos por km)',
  TIME: 'Por tempo (ex.: pontos por minuto)',
  MULTIPLIER: 'Multiplicador customizado',
};

export function AdminModalitiesPage() {
  const { showToast } = useToast();
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<ActivityType[]>('/activity-types')
      .then(({ data }) => setTypes(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as modalidades.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const { data } = await api.delete<{ status: string; message: string }>(`/activity-types/${deletingId}`);
      showToast(data.message, 'success');
      setDeletingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir a modalidade.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Modalidades</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Nova modalidade
        </button>
      </div>

      {loading && <LoadingState label="Carregando modalidades…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && types.length === 0 && <EmptyState icon="🏃" title="Nenhuma modalidade cadastrada" />}

      {!loading && !error && types.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Pontuação</th>
                <th>Evidência</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td data-label="Nome">{t.name}</td>
                  <td data-label="Categoria">{CATEGORY_LABELS[t.category] ?? t.category}</td>
                  <td data-label="Pontuação">
                    {SCORING_TYPES.includes(t.scoringType) ? t.scoringType : t.scoringType} — {t.basePoints} pts
                    {t.unit ? ` / ${t.unit}` : ''}
                  </td>
                  <td data-label="Evidência">{t.requiresEvidence ? 'Obrigatória' : 'Não exigida'}</td>
                  <td data-label="Status">
                    <span className={`badge badge--${t.status === 'ACTIVE' ? 'success' : 'neutral'}`}>
                      {t.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(t)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--small btn--danger" onClick={() => setDeletingId(t.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ModalityFormModal
          modality={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            showToast(editing ? 'Modalidade atualizada com sucesso!' : 'Modalidade criada com sucesso!', 'success');
            load();
          }}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir modalidade"
          message="Se houver atividades vinculadas, a modalidade será desativada em vez de excluída, para preservar o histórico."
          confirmLabel="Excluir"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function ModalityFormModal({
  modality,
  onClose,
  onSaved,
}: {
  modality: ActivityType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEditing = !!modality;
  const [name, setName] = useState(modality?.name ?? '');
  const [description, setDescription] = useState(modality?.description ?? '');
  const [category, setCategory] = useState(modality?.category ?? 'SPORTS');
  const [icon, setIcon] = useState(modality?.icon ?? 'activity');
  const [rulesDescription, setRulesDescription] = useState(modality?.rulesDescription ?? '');
  const [scoringType, setScoringType] = useState(modality?.scoringType ?? 'FIXED');
  const [basePoints, setBasePoints] = useState(String(modality?.basePoints ?? 10));
  const [unit, setUnit] = useState(modality?.unit ?? '');
  const [multiplier, setMultiplier] = useState(String(modality?.multiplier ?? 1));
  const [dailyLimit, setDailyLimit] = useState(modality?.dailyLimit != null ? String(modality.dailyLimit) : '');
  const [weeklyLimit, setWeeklyLimit] = useState(modality?.weeklyLimit != null ? String(modality.weeklyLimit) : '');
  const [monthlyLimit, setMonthlyLimit] = useState(modality?.monthlyLimit != null ? String(modality.monthlyLimit) : '');
  const [requiresEvidence, setRequiresEvidence] = useState(modality?.requiresEvidence ?? true);
  const [allowedFileTypes, setAllowedFileTypes] = useState(modality?.allowedFileTypes ?? 'jpg,jpeg,png,pdf');
  const [status, setStatus] = useState(modality?.status ?? 'ACTIVE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      description: description || undefined,
      category,
      icon,
      rulesDescription: rulesDescription || undefined,
      scoringType,
      basePoints: Number(basePoints),
      unit: unit || undefined,
      multiplier: Number(multiplier) || 1,
      // Ao editar, campo vazio precisa mandar `null` (remove o limite já
      // configurado) — enviar `undefined` faria a API simplesmente ignorar o
      // campo (mantendo o valor antigo). Na criação, `undefined` é o certo
      // (nasce sem limite).
      dailyLimit: dailyLimit ? Number(dailyLimit) : isEditing ? null : undefined,
      weeklyLimit: weeklyLimit ? Number(weeklyLimit) : isEditing ? null : undefined,
      monthlyLimit: monthlyLimit ? Number(monthlyLimit) : isEditing ? null : undefined,
      requiresEvidence,
      allowedFileTypes,
      status,
    };

    try {
      if (isEditing) {
        await api.patch(`/activity-types/${modality!.id}`, payload);
      } else {
        await api.post('/activity-types', payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar a modalidade.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Editar modalidade' : 'Nova modalidade'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <div className="form__row">
          <label className="field">
            <span className="field__label">Nome</span>
            <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Categoria</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field__label">Ícone (identificador para o frontend, ex.: run, dumbbell, book-open)</span>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Descrição</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Regras (exibidas ao participante)</span>
          <textarea rows={2} value={rulesDescription} onChange={(e) => setRulesDescription(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Forma de pontuação</span>
          <select value={scoringType} onChange={(e) => setScoringType(e.target.value)}>
            {SCORING_TYPES.map((s) => (
              <option key={s} value={s}>
                {SCORING_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Pontos base</span>
            <input type="number" min="1" required value={basePoints} onChange={(e) => setBasePoints(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Unidade (ex.: km, min, livro)</span>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
        </div>

        {scoringType === 'MULTIPLIER' && (
          <label className="field">
            <span className="field__label">Multiplicador</span>
            <input type="number" step="0.01" min="0.01" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </label>
        )}

        <div className="form__row">
          <label className="field">
            <span className="field__label">Limite diário</span>
            <input type="number" min="1" placeholder="Sem limite" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Limite semanal</span>
            <input type="number" min="1" placeholder="Sem limite" value={weeklyLimit} onChange={(e) => setWeeklyLimit(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Limite mensal</span>
          <input type="number" min="1" placeholder="Sem limite" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
        </label>
        <p className="field__hint">Deixe qualquer um desses três campos vazio para não ter limite (ou para remover um limite já configurado).</p>

        <label className="field field--checkbox">
          <input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} />
          <span>Exige envio de evidência (foto/comprovante)</span>
        </label>

        {requiresEvidence && (
          <label className="field">
            <span className="field__label">Extensões de arquivo permitidas (separadas por vírgula)</span>
            <input type="text" value={allowedFileTypes} onChange={(e) => setAllowedFileTypes(e.target.value)} />
          </label>
        )}

        <label className="field">
          <span className="field__label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Ativa</option>
            <option value="INACTIVE">Inativa</option>
          </select>
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar modalidade'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
