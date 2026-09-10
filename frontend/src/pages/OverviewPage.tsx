import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AdminDashboardData, AwardCycle } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';
import { LineChart } from '../components/ui/Charts';
import { Avatar } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function CurrentCycleCard() {
  const [cycle, setCycle] = useState<AwardCycle | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<AwardCycle | null>('/cycles/current')
      .then(({ data }) => setCycle(data))
      .catch(() => setCycle(null));
  }, []);

  if (cycle === undefined) return null; // ainda carregando — evita "pulo" de layout
  if (cycle === null) return null; // nenhum ciclo em andamento agora

  const daysLeft = Math.max(0, Math.ceil((new Date(cycle.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <section className="card">
      <h2 className="card__title">🏁 Ciclo Atual — {cycle.name}</h2>
      <p>
        Termina em <strong>{new Date(cycle.endDate).toLocaleDateString('pt-BR')}</strong>
        {daysLeft > 0 ? ` (faltam ${daysLeft} dia${daysLeft === 1 ? '' : 's'})` : ' (hoje)'}. Ao final, o pódio é
        premiado e a pontuação de todos reinicia para o próximo ciclo.
      </p>
      {cycle.prizes.length > 0 && (
        <div className="form__row" style={{ flexWrap: 'wrap' }}>
          {cycle.prizes.map((p) => (
            <div key={p.id} className="stat-card" style={{ minWidth: 160 }}>
              <span className="stat-card__label">
                {MEDALS[p.position]} {p.position}º lugar
              </span>
              <span className="stat-card__value stat-card__value--small">{p.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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

      <CurrentCycleCard />

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
