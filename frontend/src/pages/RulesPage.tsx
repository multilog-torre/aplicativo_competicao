import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Achievement, AchievementLevel, ActivityType, Level } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';
import { AchievementIcon } from '../components/ui/Badge';
import { describeRule } from '../utils/achievementRules';

const LEVEL_LABELS: Record<AchievementLevel, string> = { BRONZE: 'Bronze', PRATA: 'Prata', OURO: 'Ouro' };

interface GameRuleStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  icon: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  SPORTS: 'Esportes',
  HEALTH: 'Saúde',
  EDUCATION: 'Educação',
  SOCIAL: 'Social',
  OTHER: 'Outra',
};

const SCORING_LABELS: Record<string, string> = {
  FIXED: 'Pontos fixos por atividade',
  QUANTITY: 'Pontos por quantidade',
  TIME: 'Pontos por tempo',
  MULTIPLIER: 'Pontos com multiplicador',
};

/** Monta a frase de "quanto pontua" de uma modalidade a partir dos seus dados
 * atuais — sempre que o admin muda basePoints/multiplier/unit, ou cria uma
 * modalidade nova, esta página reflete o valor automaticamente (não há nada
 * hardcoded aqui: tudo vem de GET /activity-types). */
function describeScoring(t: ActivityType): string {
  if (t.scoringType === 'QUANTITY' || t.scoringType === 'MULTIPLIER') {
    const perUnit = t.unit ? ` por ${t.unit}` : '';
    return `${t.basePoints} pts${perUnit}${t.multiplier !== 1 ? ` (x${t.multiplier})` : ''}`;
  }
  if (t.scoringType === 'TIME') {
    return `${t.basePoints} pts${t.unit ? ` por ${t.unit}` : ' por unidade de tempo'}`;
  }
  return `${t.basePoints} pts por atividade`;
}

function describeLimits(t: ActivityType): string {
  const parts: string[] = [];
  if (t.dailyLimit) parts.push(`${t.dailyLimit}/dia`);
  if (t.weeklyLimit) parts.push(`${t.weeklyLimit}/semana`);
  if (t.monthlyLimit) parts.push(`${t.monthlyLimit}/mês`);
  return parts.length > 0 ? parts.join(' • ') : 'Sem limite';
}

export function RulesPage() {
  const [steps, setSteps] = useState<GameRuleStep[]>([]);
  const [modalities, setModalities] = useState<ActivityType[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<GameRuleStep[]>('/game-rules'),
      api.get<ActivityType[]>('/activity-types?status=ACTIVE'),
      api.get<Level[]>('/levels'),
      api.get<Achievement[]>('/achievements'),
    ])
      .then(([rulesRes, modalitiesRes, levelsRes, achievementsRes]) => {
        setSteps(rulesRes.data);
        setModalities(modalitiesRes.data);
        setLevels(levelsRes.data);
        setAchievements(achievementsRes.data);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as regras.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <LoadingState label="Carregando as regras…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="page">
      <h1 className="page__title">❓ Como Funciona</h1>
      <p>Um resumo rápido de como participar, pontuar e subir no ranking.</p>

      {steps.length > 0 && (
        <section className="card">
          <h2 className="card__title">🚀 Passo a passo</h2>
          <ol className="steps-list">
            {steps.map((s) => (
              <li key={s.id} className="steps-list__item">
                <span className="steps-list__num" aria-hidden="true">
                  {s.stepNumber}
                </span>
                <div>
                  <p className="steps-list__title">{s.title}</p>
                  <p className="steps-list__description">{s.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h2 className="card__title">🏋️ Pontuação por modalidade</h2>
        <p className="steps-list__description">
          Cada modalidade tem sua própria forma de pontuar, definida pelo administrador. Esta lista é sempre
          atualizada automaticamente.
        </p>
        {modalities.length === 0 ? (
          <p>Nenhuma modalidade ativa no momento.</p>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Modalidade</th>
                  <th>Categoria</th>
                  <th>Pontuação</th>
                  <th>Limite</th>
                  <th>Evidência</th>
                </tr>
              </thead>
              <tbody>
                {modalities.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Modalidade">{m.name}</td>
                    <td data-label="Categoria">{CATEGORY_LABELS[m.category] ?? m.category}</td>
                    <td data-label="Pontuação" title={SCORING_LABELS[m.scoringType] ?? m.scoringType}>
                      {describeScoring(m)}
                    </td>
                    <td data-label="Limite">{describeLimits(m)}</td>
                    <td data-label="Evidência">{m.requiresEvidence ? 'Obrigatória' : 'Não exigida'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {levels.length > 0 && (
        <section className="card">
          <h2 className="card__title">📈 Níveis de progressão</h2>
          <p className="steps-list__description">Quanto mais pontos você acumula, mais sobe na escada de níveis.</p>
          <div className="level-ladder">
            {levels.map((lvl) => (
              <span key={lvl.id} className="level-chip">
                <span className="level-chip__icon" aria-hidden="true">
                  🏅
                </span>
                {lvl.name}
                <span className="level-chip__points">a partir de {lvl.minPoints.toLocaleString('pt-BR')} pts</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="card__title">🏁 Ciclos e premiação</h2>
        <p>
          A competição roda em <strong>ciclos</strong>, cada um com data de início e fim (veja o ciclo atual no
          Painel Geral). Ao final de cada ciclo, o <strong>1º, 2º e 3º lugares</strong> do ranking geral recebem os
          prêmios definidos pelo administrador, e a pontuação de todos os colaboradores volta a zero para o próximo
          ciclo começar do zero.
        </p>
        <p className="steps-list__description">
          Suas conquistas (badges) são permanentes e nunca são resetadas — elas continuam valendo mesmo quando um
          ciclo termina.
        </p>
      </section>

      <AchievementCatalogSection achievements={achievements} activityTypes={modalities} />
    </div>
  );
}

/**
 * Catálogo de conquistas — documentação viva: renderiza direto do banco
 * (GET /achievements) toda vez que a página carrega, sem nada gerado ou
 * hardcoded. Qualquer conquista criada/editada/desativada pelo admin
 * aparece aqui automaticamente na próxima visita, exatamente como as
 * seções de modalidade/nível acima.
 */
function AchievementCatalogSection({ achievements, activityTypes }: { achievements: Achievement[]; activityTypes: ActivityType[] }) {
  if (achievements.length === 0) return null;

  const active = achievements.filter((a) => a.status === 'ACTIVE');
  const discontinued = achievements.filter((a) => a.status !== 'ACTIVE');

  const grouped = new Map<string, Achievement[]>();
  for (const a of active) {
    const list = grouped.get(a.category) ?? [];
    list.push(a);
    grouped.set(a.category, list);
  }

  return (
    <section className="card">
      <h2 className="card__title">🏆 Catálogo de Conquistas</h2>
      <p className="steps-list__description">
        Desbloqueadas automaticamente ao cumprir o critério — acompanhe seu progresso na aba "Meu Perfil".
      </p>

      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category} className="achievement-catalog__category">
          <h3 className="achievement-catalog__category-title">{category}</h3>
          <div className="achievement-catalog__grid">
            {items.map((a) => (
              <div key={a.id} className="achievement-catalog__card">
                <AchievementIcon icon={a.icon} iconType={a.iconType} size={44} />
                <div className="achievement-catalog__card-body">
                  <div className="achievement-catalog__name">
                    {a.name}
                    <span className={`badge badge--level-${a.level.toLowerCase()}`}>{LEVEL_LABELS[a.level] ?? a.level}</span>
                  </div>
                  <p className="achievement-catalog__description">{a.description}</p>
                  <p className="achievement-catalog__criterion">Critério: {describeRule(a.ruleType, a.ruleValue, activityTypes)}</p>
                  <div className="achievement-catalog__footer">
                    <span className="achievement-catalog__points">+{a.pointsReward} pts</span>
                    {typeof a.unlockedCount === 'number' && (
                      <span className="achievement-catalog__unlocked-count">
                        {a.unlockedCount} pessoa{a.unlockedCount === 1 ? '' : 's'} já conquistou
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {discontinued.length > 0 && (
        <details className="achievement-catalog__discontinued">
          <summary>Conquistas descontinuadas ({discontinued.length})</summary>
          <p className="steps-list__description">
            Não podem mais ser conquistadas, mas quem já as tinha continua com elas — uma conquista concedida nunca é
            revogada.
          </p>
          <ul className="achievement-catalog__discontinued-list">
            {discontinued.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong> — {a.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
