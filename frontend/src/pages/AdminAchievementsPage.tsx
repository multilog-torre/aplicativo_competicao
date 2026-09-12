import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Achievement, ActivityType, AchievementLevel } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal } from '../components/ui/Modal';
import { AchievementIcon } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const LEVELS: AchievementLevel[] = ['BRONZE', 'PRATA', 'OURO'];
const LEVEL_LABELS: Record<AchievementLevel, string> = { BRONZE: 'Bronze', PRATA: 'Prata', OURO: 'Ouro' };

const RULE_TYPES = [
  'ACTIVITY_COUNT',
  'TOTAL_POINTS',
  'STREAK_DAYS',
  'SPECIFIC_MODALITY',
  'CUMULATIVE_QUANTITY',
  'DISTINCT_MODALITIES',
  'RANKING_POSITION',
  'ACCOUNT_TENURE_DAYS',
] as const;
type RuleType = (typeof RULE_TYPES)[number];

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  ACTIVITY_COUNT: 'Contagem de atividades (qualquer modalidade)',
  TOTAL_POINTS: 'Total de pontos acumulados',
  STREAK_DAYS: 'Sequência de dias consecutivos',
  SPECIFIC_MODALITY: 'Contagem de atividades de uma modalidade',
  CUMULATIVE_QUANTITY: 'Quantidade acumulada de uma modalidade (ex.: km)',
  DISTINCT_MODALITIES: 'Atividade em N modalidades diferentes',
  RANKING_POSITION: 'Posição no ranking geral',
  ACCOUNT_TENURE_DAYS: 'Dias desde a criação da conta',
};

/** Descrição em linguagem simples do critério — mesmo texto usado na Etapa 5
 * (Catálogo de Conquistas), construído aqui só pra pré-visualização no admin. */
function describeRule(ruleType: string, ruleValue: Record<string, unknown>, activityTypes: ActivityType[]): string {
  const modalityName = (id: unknown) => activityTypes.find((a) => a.id === id)?.name ?? 'modalidade removida';
  switch (ruleType) {
    case 'ACTIVITY_COUNT':
      return `${ruleValue.count ?? '?'} atividades aprovadas`;
    case 'TOTAL_POINTS':
      return `${ruleValue.minPoints ?? '?'} pontos acumulados`;
    case 'STREAK_DAYS':
      return `${ruleValue.days ?? '?'} dias seguidos com atividade`;
    case 'SPECIFIC_MODALITY':
      return `${ruleValue.count ?? 1} atividades de ${modalityName(ruleValue.activityTypeId)}`;
    case 'CUMULATIVE_QUANTITY':
      return `${ruleValue.targetQuantity ?? '?'} de ${modalityName(ruleValue.activityTypeId)} acumulados`;
    case 'DISTINCT_MODALITIES':
      return `atividade em ${ruleValue.count ?? '?'} modalidades diferentes`;
    case 'RANKING_POSITION':
      return `posição ${ruleValue.maxPosition ?? '?'}º ou melhor no ranking geral`;
    case 'ACCOUNT_TENURE_DAYS':
      return `${ruleValue.days ?? '?'} dias desde a criação da conta`;
    default:
      return ruleType;
  }
}

export function AdminAchievementsPage() {
  const { showToast } = useToast();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [creating, setCreating] = useState(false);
  const [iconTarget, setIconTarget] = useState<Achievement | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<Achievement[]>('/achievements')
      .then(({ data }) => setAchievements(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as conquistas.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get<ActivityType[]>('/activity-types?status=ACTIVE').then(({ data }) => setActivityTypes(data)).catch(() => undefined);
  }, []);

  const categories = useMemo(() => Array.from(new Set(achievements.map((a) => a.category))).sort(), [achievements]);

  const filtered = achievements.filter(
    (a) => (!categoryFilter || a.category === categoryFilter) && (!levelFilter || a.level === levelFilter),
  );

  async function toggleStatus(achievement: Achievement) {
    const nextStatus = achievement.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/achievements/${achievement.id}`, { status: nextStatus });
      showToast(nextStatus === 'ACTIVE' ? 'Conquista reativada.' : 'Conquista desativada — o histórico de quem já a conquistou é preservado.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível alterar o status.', 'error');
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Conquistas</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Nova conquista
        </button>
      </div>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Filtrar por categoria</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Filtrar por nível</span>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Todos os níveis</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <LoadingState label="Carregando conquistas…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="🏆" title="Nenhuma conquista encontrada" />}

      {!loading && !error && filtered.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Ícone</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Nível</th>
                <th>Critério</th>
                <th>Pontos</th>
                <th>Conquistado por</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td data-label="Ícone">
                    <AchievementIcon icon={a.icon} iconType={a.iconType} size={32} />
                  </td>
                  <td data-label="Nome">{a.name}</td>
                  <td data-label="Categoria">{a.category}</td>
                  <td data-label="Nível">{LEVEL_LABELS[a.level] ?? a.level}</td>
                  <td data-label="Critério" title={describeRule(a.ruleType, a.ruleValue, activityTypes)}>
                    {describeRule(a.ruleType, a.ruleValue, activityTypes)}
                  </td>
                  <td data-label="Pontos">+{a.pointsReward}</td>
                  <td data-label="Conquistado por">{a.unlockedCount ?? 0} pessoa{a.unlockedCount === 1 ? '' : 's'}</td>
                  <td data-label="Status">
                    <span className={`badge badge--${a.status === 'ACTIVE' ? 'success' : 'neutral'}`}>
                      {a.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(a)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setIconTarget(a)}>
                      Ícone
                    </button>
                    <button
                      type="button"
                      className={`btn btn--small ${a.status === 'ACTIVE' ? 'btn--danger' : 'btn--secondary'}`}
                      onClick={() => toggleStatus(a)}
                    >
                      {a.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <AchievementFormModal
          achievement={editing}
          activityTypes={activityTypes}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            showToast(editing ? 'Conquista atualizada com sucesso!' : 'Conquista criada com sucesso!', 'success');
            load();
          }}
        />
      )}

      {iconTarget && (
        <IconFormModal
          achievement={iconTarget}
          onClose={() => setIconTarget(null)}
          onSaved={() => {
            setIconTarget(null);
            showToast('Ícone atualizado com sucesso!', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

/** Campos do critério que dependem do ruleType escolhido — cada tipo tem um
 * formato próprio de ruleValue (ver achievement.dto.ts no backend). */
function RuleValueFields({
  ruleType,
  ruleValue,
  onChange,
  activityTypes,
}: {
  ruleType: RuleType;
  ruleValue: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  activityTypes: ActivityType[];
}) {
  const set = (key: string, value: string) => onChange({ ...ruleValue, [key]: value });

  const needsModality = ruleType === 'SPECIFIC_MODALITY' || ruleType === 'CUMULATIVE_QUANTITY';

  return (
    <div className="form__row">
      {needsModality && (
        <label className="field">
          <span className="field__label">Modalidade</span>
          <select value={ruleValue.activityTypeId ?? ''} onChange={(e) => set('activityTypeId', e.target.value)} required>
            <option value="">Selecione…</option>
            {activityTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {ruleType === 'ACTIVITY_COUNT' && (
        <label className="field">
          <span className="field__label">Quantidade de atividades</span>
          <input type="number" min="1" required value={ruleValue.count ?? ''} onChange={(e) => set('count', e.target.value)} />
        </label>
      )}
      {ruleType === 'TOTAL_POINTS' && (
        <label className="field">
          <span className="field__label">Pontos mínimos</span>
          <input type="number" min="1" required value={ruleValue.minPoints ?? ''} onChange={(e) => set('minPoints', e.target.value)} />
        </label>
      )}
      {ruleType === 'STREAK_DAYS' && (
        <label className="field">
          <span className="field__label">Dias consecutivos</span>
          <input type="number" min="1" required value={ruleValue.days ?? ''} onChange={(e) => set('days', e.target.value)} />
        </label>
      )}
      {ruleType === 'SPECIFIC_MODALITY' && (
        <label className="field">
          <span className="field__label">Quantidade de atividades</span>
          <input type="number" min="1" required value={ruleValue.count ?? ''} onChange={(e) => set('count', e.target.value)} />
        </label>
      )}
      {ruleType === 'CUMULATIVE_QUANTITY' && (
        <label className="field">
          <span className="field__label">Meta (unidade da própria modalidade — ex.: km)</span>
          <input type="number" min="1" step="0.1" required value={ruleValue.targetQuantity ?? ''} onChange={(e) => set('targetQuantity', e.target.value)} />
        </label>
      )}
      {ruleType === 'DISTINCT_MODALITIES' && (
        <label className="field">
          <span className="field__label">Número de modalidades diferentes</span>
          <input type="number" min="1" required value={ruleValue.count ?? ''} onChange={(e) => set('count', e.target.value)} />
        </label>
      )}
      {ruleType === 'RANKING_POSITION' && (
        <label className="field">
          <span className="field__label">Posição máxima (ex.: 3 = Top 3)</span>
          <input type="number" min="1" required value={ruleValue.maxPosition ?? ''} onChange={(e) => set('maxPosition', e.target.value)} />
        </label>
      )}
      {ruleType === 'ACCOUNT_TENURE_DAYS' && (
        <label className="field">
          <span className="field__label">Dias desde a criação da conta</span>
          <input type="number" min="1" required value={ruleValue.days ?? ''} onChange={(e) => set('days', e.target.value)} />
        </label>
      )}
    </div>
  );
}

type AuditEntry = { id: string; action: string; createdAt: string; user: { name: string } | null };

/** Histórico de quem alterou e quando — só ADMIN_MASTER audita (mesma regra
 * já usada pela trilha de auditoria geral do sistema); um ADMIN comum vê só
 * a data da última atualização, já presente no próprio registro. */
function AuditHistory({ achievementId }: { achievementId: string }) {
  const { isAdminMaster } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    if (!isAdminMaster) return;
    api
      .get<AuditEntry[]>(`/admin/audit-logs?entity=Achievement&entityId=${achievementId}&limit=10`)
      .then(({ data }) => setEntries(data))
      .catch(() => setEntries([]));
  }, [achievementId, isAdminMaster]);

  if (!isAdminMaster || !entries || entries.length === 0) return null;

  return (
    <div className="achievement-audit-history">
      <span className="field__label">Histórico de alterações</span>
      <ul className="achievement-audit-history__list">
        {entries.map((e) => (
          <li key={e.id}>
            {e.action} por <strong>{e.user?.name ?? 'usuário removido'}</strong> em {new Date(e.createdAt).toLocaleString('pt-BR')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AchievementFormModal({
  achievement,
  activityTypes,
  onClose,
  onSaved,
}: {
  achievement: Achievement | null;
  activityTypes: ActivityType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEditing = !!achievement;
  const [name, setName] = useState(achievement?.name ?? '');
  const [description, setDescription] = useState(achievement?.description ?? '');
  const [category, setCategory] = useState(achievement?.category ?? 'GERAL');
  const [level, setLevel] = useState<AchievementLevel>(achievement?.level ?? 'BRONZE');
  const [ruleType, setRuleType] = useState<RuleType>((achievement?.ruleType as RuleType) ?? 'ACTIVITY_COUNT');
  const [ruleValue, setRuleValue] = useState<Record<string, string>>(() => {
    const raw = achievement?.ruleValue ?? {};
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  });
  const [pointsReward, setPointsReward] = useState(String(achievement?.pointsReward ?? 30));
  const [icon, setIcon] = useState(achievement?.icon ?? 'trophy');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(achievement?.status ?? 'ACTIVE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRuleTypeChange(next: RuleType) {
    setRuleType(next);
    setRuleValue({}); // cada tipo tem campos diferentes — evita misturar valor antigo incompatível
  }

  function buildRuleValue(): Record<string, number | string> {
    const out: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(ruleValue)) {
      out[key] = key === 'activityTypeId' ? value : Number(value);
    }
    return out;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      description,
      category,
      level,
      ruleType,
      ruleValue: buildRuleValue(),
      pointsReward: Number(pointsReward),
      icon: achievement?.iconType === 'UPLOAD' ? undefined : icon, // não sobrescreve um ícone-imagem já enviado
      status,
    };

    try {
      if (isEditing) {
        await api.patch(`/achievements/${achievement!.id}`, payload);
      } else {
        await api.post('/achievements', payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar a conquista.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Editar conquista' : 'Nova conquista'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <div className="form__row">
          <label className="field">
            <span className="field__label">Nome</span>
            <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Categoria</span>
            <input type="text" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex.: CONSISTENCIA, RANKING_PONTUACAO" />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Descrição</span>
          <textarea rows={2} required minLength={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Nível</span>
            <select value={level} onChange={(e) => setLevel(e.target.value as AchievementLevel)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Pontos de recompensa</span>
            <input type="number" min="0" required value={pointsReward} onChange={(e) => setPointsReward(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Tipo de critério</span>
          <select value={ruleType} onChange={(e) => handleRuleTypeChange(e.target.value as RuleType)}>
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RULE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <RuleValueFields ruleType={ruleType} ruleValue={ruleValue} onChange={setRuleValue} activityTypes={activityTypes} />

        {achievement?.iconType !== 'UPLOAD' && (
          <label className="field">
            <span className="field__label">Ícone (emoji/identificador — ex.: 🔥 ou flame)</span>
            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} />
          </label>
        )}
        {achievement?.iconType === 'UPLOAD' && (
          <p className="field__label">Esta conquista usa uma imagem enviada — troque pelo botão "Ícone" na listagem.</p>
        )}

        <label className="field">
          <span className="field__label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
            <option value="ACTIVE">Ativa</option>
            <option value="INACTIVE">Inativa</option>
          </select>
        </label>

        {isEditing && (
          <p className="field__label">
            Atualizada em {new Date(achievement!.updatedAt).toLocaleString('pt-BR')}. Alterar a meta não revoga conquistas já concedidas — vale só para o cálculo daí em diante.
          </p>
        )}
        {isEditing && <AuditHistory achievementId={achievement!.id} />}

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar conquista'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function IconFormModal({ achievement, onClose, onSaved }: { achievement: Achievement; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'EMOJI' | 'UPLOAD'>(achievement.iconType);
  const [emoji, setEmoji] = useState(achievement.iconType === 'EMOJI' ? achievement.icon : '🏆');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'UPLOAD' && !file) {
      setError('Selecione uma imagem (PNG ou SVG) para enviar.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('iconType', mode);
      if (mode === 'EMOJI') {
        formData.append('icon', emoji);
      } else if (file) {
        formData.append('file', file);
      }
      await api.patch(`/achievements/${achievement.id}/icon`, formData, true);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível trocar o ícone.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Ícone de "${achievement.name}"`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <div className="achievement-icon-preview">
          <AchievementIcon icon={achievement.icon} iconType={achievement.iconType} size={56} />
          <span className="field__label">Ícone atual</span>
        </div>

        <div className="form__row">
          <label className="field field--checkbox">
            <input type="radio" name="iconMode" checked={mode === 'EMOJI'} onChange={() => setMode('EMOJI')} />
            <span>Emoji/identificador</span>
          </label>
          <label className="field field--checkbox">
            <input type="radio" name="iconMode" checked={mode === 'UPLOAD'} onChange={() => setMode('UPLOAD')} />
            <span>Upload de imagem</span>
          </label>
        </div>

        {mode === 'EMOJI' ? (
          <label className="field">
            <span className="field__label">Emoji ou identificador (ex.: 🔥 ou flame)</span>
            <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span className="field__label">Imagem (PNG ou SVG)</span>
            <input type="file" accept="image/png,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar ícone'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
