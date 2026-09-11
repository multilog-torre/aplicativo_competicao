import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AwardCycle, DashboardData } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/Badge';
import { ChartCard, GranularityTabs, LineChart, BarChart, PointsHistoryGranularity } from '../components/ui/Charts';

interface DraftFilters {
  dateFrom: string;
  dateTo: string;
  cycleId: string;
}

const EMPTY_FILTERS: DraftFilters = { dateFrom: '', dateTo: '', cycleId: '' };

function hasAnyFilter(f: DraftFilters): boolean {
  return f.dateFrom !== '' || f.dateTo !== '' || f.cycleId !== '';
}

/** Mesma convenção usada no Painel Geral: datas interpretadas como meia-
 * noite/fim do dia LOCAL (não UTC), pra não reintroduzir o deslocamento de
 * fuso já corrigido antes pras datas de atividade. */
function buildFilterQuery(f: DraftFilters): string {
  const params = new URLSearchParams();
  if (f.cycleId) {
    params.set('cycleId', f.cycleId);
  } else {
    if (f.dateFrom) params.set('dateFrom', new Date(`${f.dateFrom}T00:00:00`).toISOString());
    if (f.dateTo) params.set('dateTo', new Date(`${f.dateTo}T23:59:59.999`).toISOString());
  }
  const qs = params.toString();
  return qs ? `&${qs}` : '';
}

/** "Evolução de pontos" pessoal, com dia/mês/ano — o gráfico é o mesmo
 * componente do Painel Geral, só que alimentado com o histórico de um
 * único usuário (a própria pessoa). */
function PersonalPointsHistoryChart({ pointsHistory }: { pointsHistory: DashboardData['charts']['pointsHistory'] }) {
  const [granularity, setGranularity] = useState<PointsHistoryGranularity>('day');
  const series = pointsHistory[granularity];

  return (
    <ChartCard title="Evolução de pontos" actions={<GranularityTabs value={granularity} onChange={setGranularity} />}>
      {(size) => <LineChart data={series.map((p) => ({ label: p.label, value: p.points, tooltipLabel: p.label }))} size={size} />}
    </ChartCard>
  );
}

function FilterBar({
  draft,
  onChange,
  onApply,
  onClear,
  cycles,
}: {
  draft: DraftFilters;
  onChange: (next: DraftFilters) => void;
  onApply: () => void;
  onClear: () => void;
  cycles: AwardCycle[];
}) {
  return (
    <section className="card">
      <h2 className="card__title">Filtros</h2>
      <div className="form__row">
        <label className="field">
          <span className="field__label">Data inicial</span>
          <input type="date" value={draft.dateFrom} disabled={!!draft.cycleId} onChange={(e) => onChange({ ...draft, dateFrom: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Data final</span>
          <input type="date" value={draft.dateTo} disabled={!!draft.cycleId} onChange={(e) => onChange({ ...draft, dateTo: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Ciclo de premiação</span>
          <select value={draft.cycleId} onChange={(e) => onChange({ ...draft, cycleId: e.target.value, dateFrom: '', dateTo: '' })}>
            <option value="">Todos os períodos</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form__actions">
        <button type="button" className="btn btn--secondary" onClick={onClear} disabled={!hasAnyFilter(draft)}>
          Limpar filtros
        </button>
        <button type="button" className="btn btn--primary" onClick={onApply}>
          Aplicar filtros
        </button>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<AwardCycle[]>([]);

  const [draftFilters, setDraftFilters] = useState<DraftFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DraftFilters>(EMPTY_FILTERS);

  useEffect(() => {
    api.get<AwardCycle[]>('/cycles?limit=100').then(({ data }) => setCycles(data)).catch(() => undefined);
  }, []);

  const query = useMemo(() => buildFilterQuery(appliedFilters), [appliedFilters]);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<DashboardData>(`/dashboard?activityLimit=5${query}`)
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [query]);

  if (loading && !dashboard) return <LoadingState label="Carregando seu dashboard…" />;
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

      <FilterBar
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={() => setAppliedFilters(draftFilters)}
        onClear={() => {
          setDraftFilters(EMPTY_FILTERS);
          setAppliedFilters(EMPTY_FILTERS);
        }}
        cycles={cycles}
      />

      <div className="grid-2">
        <PersonalPointsHistoryChart pointsHistory={charts.pointsHistory} />
        <ChartCard title="Atividades por modalidade">
          {() =>
            charts.activitiesByModality.length === 0 ? (
              <EmptyState icon="🏃" title="Nenhuma atividade aprovada ainda" />
            ) : (
              <BarChart data={charts.activitiesByModality.map((m) => ({ label: m.activityTypeName, value: m.count }))} />
            )
          }
        </ChartCard>
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
