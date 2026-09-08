import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { RankingEntry } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Avatar } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';

const PERIODS = [
  { value: 'GENERAL', label: 'Geral' },
  { value: 'WEEK', label: 'Semana' },
  { value: 'MONTH', label: 'Mês' },
  { value: 'YEAR', label: 'Ano' },
];

export function RankingPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('GENERAL');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<RankingEntry[]>(`/ranking?period=${period}&limit=50`)
      .then(({ data }) => setEntries(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o ranking.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [period]);

  return (
    <div className="page">
      <h1 className="page__title">Ranking</h1>

      <div className="tabs" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            className={`tabs__item ${period === p.value ? 'tabs__item--active' : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState label="Carregando ranking…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && entries.length === 0 && <EmptyState icon="🏆" title="Ninguém pontuou neste período ainda" />}

      {!loading && !error && entries.length > 0 && (
        <ul className="ranking-list">
          {entries.map((e) => (
            <li key={e.userId} className={`ranking-row ${e.userId === user?.id ? 'ranking-row--me' : ''}`}>
              <span className="ranking-row__position">{e.position}º</span>
              <Avatar name={e.name} avatarType={e.avatarType} avatarUrl={e.avatarUrl} userId={e.userId} />
              <div className="ranking-row__info">
                <span className="ranking-row__name">{e.name}</span>
                {e.department && <span className="ranking-row__department">{e.department.name}</span>}
              </div>
              <span className="ranking-row__points">{e.points.toLocaleString('pt-BR')} pts</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
