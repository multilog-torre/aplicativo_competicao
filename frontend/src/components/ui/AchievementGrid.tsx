import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { AchievementLevel, AchievementWithProgress, ActivityType } from '../../types/api';
import { describeRule } from '../../utils/achievementRules';
import { AchievementIcon } from './Badge';
import { LoadingState, EmptyState, ErrorState } from './States';
import { Modal } from './Modal';

const LEVEL_LABELS: Record<AchievementLevel, string> = { BRONZE: 'Bronze', PRATA: 'Prata', OURO: 'Ouro' };

/**
 * Grade "Minhas Conquistas" — brasões desbloqueados em destaque, bloqueados
 * em silhueta com barra de progresso. Clicar em qualquer brasão abre o
 * detalhe (critério, pontos, data de desbloqueio ou progresso atual).
 */
export function AchievementGrid({ userId }: { userId: string }) {
  const [items, setItems] = useState<AchievementWithProgress[] | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AchievementWithProgress | null>(null);

  function load() {
    setError(null);
    api
      .get<AchievementWithProgress[]>(`/achievements/users/${userId}/progress`)
      .then(({ data }) => setItems(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar suas conquistas.'));
  }

  useEffect(load, [userId]);
  useEffect(() => {
    api.get<ActivityType[]>('/activity-types?status=ACTIVE').then(({ data }) => setActivityTypes(data)).catch(() => undefined);
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <LoadingState label="Carregando suas conquistas…" />;
  if (items.length === 0) return <EmptyState icon="🏆" title="Nenhuma conquista disponível ainda" />;

  const unlockedCount = items.filter((i) => i.unlocked).length;

  return (
    <>
      <p className="field__label">
        {unlockedCount} de {items.length} conquistadas
      </p>
      <div className="achievement-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`achievement-grid__item ${item.unlocked ? '' : 'achievement-grid__item--locked'}`}
            onClick={() => setSelected(item)}
            title={item.name}
          >
            <div className="achievement-grid__icon">
              <AchievementIcon icon={item.icon} iconType={item.iconType} size={48} />
            </div>
            <span className="achievement-grid__name">{item.name}</span>
            {!item.unlocked && item.progress && (
              <div className="achievement-grid__progress">
                <div className="achievement-grid__progress-track">
                  <div className="achievement-grid__progress-fill" style={{ width: `${item.progress.percent}%` }} />
                </div>
                <span className="achievement-grid__progress-label">
                  {item.progress.lowerIsBetter ? `${item.progress.current || '—'}º / Top ${item.progress.target}` : `${item.progress.current}/${item.progress.target}`}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="achievement-detail">
            <div className="achievement-detail__header">
              <AchievementIcon icon={selected.icon} iconType={selected.iconType} size={64} />
              <div>
                <span className={`badge badge--level-${selected.level.toLowerCase()}`}>{LEVEL_LABELS[selected.level] ?? selected.level}</span>
                <span className="achievement-detail__category">{selected.category}</span>
              </div>
            </div>
            <p>{selected.description}</p>
            <p className="achievement-detail__criterion">Critério: {describeRule(selected.ruleType, selected.ruleValue, activityTypes)}</p>
            <p className="achievement-detail__points">+{selected.pointsReward} pts de recompensa</p>
            {selected.unlocked ? (
              <p className="achievement-detail__status achievement-detail__status--unlocked">
                🏆 Conquistada em {selected.unlockedAt ? new Date(selected.unlockedAt).toLocaleDateString('pt-BR') : '—'}
              </p>
            ) : selected.progress ? (
              <div className="achievement-detail__status">
                <div className="achievement-grid__progress-track">
                  <div className="achievement-grid__progress-fill" style={{ width: `${selected.progress.percent}%` }} />
                </div>
                <p>
                  {selected.progress.lowerIsBetter
                    ? `Posição atual: ${selected.progress.current || '—'}º (meta: Top ${selected.progress.target})`
                    : `Progresso: ${selected.progress.current} / ${selected.progress.target}`}
                </p>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}
