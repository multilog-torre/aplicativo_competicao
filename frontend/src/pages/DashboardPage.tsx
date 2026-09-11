import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { DashboardData } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/Badge';
import { LineChart, BarChart } from '../components/ui/Charts';

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<DashboardData>('/dashboard')
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <LoadingState label="Carregando seu dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dashboard) return null;

  const { points, ranking, level, recentActivities, charts, motivationalMessage } = dashboard;
  const progressPct = level.progress.target
    ? Math.min(100, Math.round((level.progress.current / level.progress.target) * 100))
    : 100;

  return (
    <div className="page">
      <h1 className="page__title">Meu Dashboard</h1>

      <div className="banner banner--motivational">{motivationalMessage}</div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Minha pontuação</span>
          <span className="stat-card__value">{points.total.toLocaleString('pt-BR')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Ranking</span>
          <span className="stat-card__value">
            {ranking.position ? `${ranking.position}º` : '—'}
            <small> / {ranking.totalParticipants}</small>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Nível</span>
          <span className="stat-card__value">{level.current?.name ?? '—'}</span>
        </div>
        <div className="stat-card stat-card--progress">
          <span className="stat-card__label">Progresso</span>
          <span className="stat-card__value stat-card__value--small">
            {level.progress.current.toLocaleString('pt-BR')} / {level.progress.target?.toLocaleString('pt-BR') ?? 'MAX'}
          </span>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card__title">Evolução de pontos (30 dias)</h2>
          <LineChart
            data={charts.pointsEvolution.map((p) => ({
              // "date" vem como "AAAA-MM-DD" (ver dashboard.service.ts) — recorta o
              // texto direto em vez de usar `new Date(string)`, que interpretaria
              // como UTC e mostraria o dia errado dependendo do fuso do navegador.
              label: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`,
              value: p.cumulativePoints,
              tooltipLabel: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}/${p.date.slice(0, 4)}`,
            }))}
          />
        </section>
        <section className="card">
          <h2 className="card__title">Atividades por modalidade</h2>
          {charts.activitiesByModality.length === 0 ? (
            <EmptyState icon="🏃" title="Nenhuma atividade aprovada ainda" />
          ) : (
            <BarChart data={charts.activitiesByModality.map((m) => ({ label: m.activityTypeName, value: m.count }))} />
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="card__title">Atividades recentes</h2>
        {recentActivities.length === 0 ? (
          <EmptyState icon="📋" title="Você ainda não registrou nenhuma atividade" description="Registre sua primeira atividade para começar a pontuar." />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Atividade</th>
                  <th>Pontos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentActivities.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Data">{new Date(a.activityDate).toLocaleDateString('pt-BR')}</td>
                    <td data-label="Atividade">
                      {a.activityTypeName} ({a.quantity}
                      {a.unit ? ` ${a.unit}` : ''})
                    </td>
                    <td data-label="Pontos">+{a.calculatedPoints}</td>
                    <td data-label="Status">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
