import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ActivityType, Level } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<GameRuleStep[]>('/game-rules'),
      api.get<ActivityType[]>('/activity-types?status=ACTIVE'),
      api.get<Level[]>('/levels'),
    ])
      .then(([rulesRes, modalitiesRes, levelsRes]) => {
        setSteps(rulesRes.data);
        setModalities(modalitiesRes.data);
        setLevels(levelsRes.data);
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
    </div>
  );
}
