import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AdminDashboardData } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';
import { LineChart } from '../components/ui/Charts';
import { Avatar } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Painel Geral — visão consolidada do progresso de todos os colaboradores,
 * aberta a qualquer usuário autenticado (não é uma tela administrativa). */
export function OverviewPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<AdminDashboardData>('/admin/dashboard')
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o painel geral.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <LoadingState label="Carregando painel geral…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dashboard) return null;

  const { indicators, topRanking, charts } = dashboard;
  const engagementToday = charts.activitiesOverTime[charts.activitiesOverTime.length - 1]?.approvedCount ?? 0;

  return (
    <div className="page">
      <h1 className="page__title">Painel Geral</h1>

      <div className="banner banner--motivational">
        {indicators.activeUsers} colaboradores ativos • {indicators.points.netCirculating.toLocaleString('pt-BR')} pts em circulação
        {indicators.topModality ? ` • Modalidade em alta: ${indicators.topModality.name}` : ''}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Colaboradores</span>
          <span className="stat-card__value">
            {indicators.activeUsers}
            <small> / {indicators.totalUsers}</small>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Pontos distribuídos</span>
          <span className="stat-card__value stat-card__value--small">{indicators.points.totalDistributed.toLocaleString('pt-BR')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Atividades pendentes</span>
          <span className="stat-card__value">{indicators.activities.pending}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Aprovadas hoje</span>
          <span className="stat-card__value">{engagementToday}</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card__title">Pontos distribuídos (30 dias)</h2>
          <LineChart data={charts.pointsDistributedOverTime.map((p) => ({ label: p.date, value: p.points }))} />
        </section>
        <section className="card">
          <h2 className="card__title">Atividades aprovadas (30 dias)</h2>
          <LineChart data={charts.activitiesOverTime.map((p) => ({ label: p.date, value: p.approvedCount }))} color="var(--color-success)" />
        </section>
      </div>

      <section className="card">
        <h2 className="card__title">Top 5 do ranking geral</h2>
        {topRanking.length === 0 ? (
          <p>Ninguém pontuou ainda.</p>
        ) : (
          <ul className="ranking-list">
            {topRanking.map((e) => (
              <li key={e.id} className={`ranking-row ${e.id === user?.id ? 'ranking-row--me' : ''}`}>
                <span className="ranking-row__position">{MEDALS[e.position] ?? `${e.position}º`}</span>
                <Avatar name={e.name} />
                <div className="ranking-row__info">
                  <span className="ranking-row__name">{e.name}</span>
                </div>
                <span className="ranking-row__points">{e.points.toLocaleString('pt-BR')} pts</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
