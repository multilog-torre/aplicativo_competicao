import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AdminDashboardData, ActivityType, AwardCycle, Department, RankingEntry } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';
import { ChartCard, GranularityTabs, LineChart, MultiLineChart, BarChart, PointsHistoryGranularity, Series } from '../components/ui/Charts';
import { FilterDrawer } from '../components/ui/FilterDrawer';
import { Avatar } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Evolução histórica dos pontos distribuídos a todos os usuários, com a
 * pessoa podendo trocar a granularidade (dia/mês/ano) direto no gráfico. */
function PointsHistoryChart({ pointsHistory }: { pointsHistory: AdminDashboardData['charts']['pointsHistory'] }) {
  const [granularity, setGranularity] = useState<PointsHistoryGranularity>('day');
  const series = pointsHistory[granularity];

  return (
    <ChartCard title="Pontos distribuídos — evolução histórica" actions={<GranularityTabs value={granularity} onChange={setGranularity} />}>
      {(size) => <LineChart data={series.map((p) => ({ label: p.label, value: p.points, tooltipLabel: p.label }))} size={size} />}
    </ChartCard>
  );
}

/** "Evolução dos usuários" — top 5 por saldo (ou só 1, se o painel estiver
 * filtrado por usuário), uma linha por pessoa. Clicar no nome na legenda
 * filtra o painel inteiro por aquele usuário (mesmo gancho usado no Top 5
 * do ranking, mais abaixo). */
function TopUsersEvolutionChart({
  topUsersEvolution,
  onUserClick,
}: {
  topUsersEvolution: AdminDashboardData['charts']['topUsersEvolution'];
  onUserClick: (userId: string) => void;
}) {
  const [granularity, setGranularity] = useState<PointsHistoryGranularity>('day');
  const raw = topUsersEvolution[granularity];
  const series: Series[] = raw.map((u) => ({
    id: u.userId,
    name: u.name,
    data: u.series.map((p) => ({ label: p.label, value: p.points })),
  }));

  return (
    <ChartCard title="Evolução dos usuários" actions={<GranularityTabs value={granularity} onChange={setGranularity} />}>
      {(size) => (
        <MultiLineChart
          series={series}
          size={size}
          onSeriesClick={onUserClick}
          emptyMessage="Ainda não há pontuação suficiente pra comparar usuários neste período."
        />
      )}
    </ChartCard>
  );
}

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

interface DraftFilters {
  dateFrom: string;
  dateTo: string;
  cycleId: string;
  userId: string;
  departmentId: string;
  activityTypeId: string;
}

const EMPTY_FILTERS: DraftFilters = { dateFrom: '', dateTo: '', cycleId: '', userId: '', departmentId: '', activityTypeId: '' };

function hasAnyFilter(f: DraftFilters): boolean {
  return Object.values(f).some((v) => v !== '');
}

/** Constrói a query string pro GET /admin/dashboard a partir dos filtros —
 * datas são interpretadas como meia-noite/fim do dia LOCAL (não UTC), pra
 * não reintroduzir o mesmo deslocamento de fuso já corrigido antes pras
 * datas de atividade. */
function buildFilterQuery(f: DraftFilters): string {
  const params = new URLSearchParams();
  if (f.cycleId) {
    params.set('cycleId', f.cycleId);
  } else {
    if (f.dateFrom) params.set('dateFrom', new Date(`${f.dateFrom}T00:00:00`).toISOString());
    if (f.dateTo) params.set('dateTo', new Date(`${f.dateTo}T23:59:59.999`).toISOString());
  }
  if (f.userId) params.set('userId', f.userId);
  if (f.departmentId) params.set('departmentId', f.departmentId);
  if (f.activityTypeId) params.set('activityTypeId', f.activityTypeId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Só os campos + ações do painel de filtros — o container flutuante (abrir/
 * fechar, fundo escurecido) é responsabilidade do FilterDrawer, que envolve
 * este componente. */
function FilterFields({
  draft,
  onChange,
  onApply,
  onClear,
  cycles,
  departments,
  activityTypes,
  users,
}: {
  draft: DraftFilters;
  onChange: (next: DraftFilters) => void;
  onApply: () => void;
  onClear: () => void;
  cycles: AwardCycle[];
  departments: Department[];
  activityTypes: ActivityType[];
  users: RankingEntry[];
}) {
  return (
    <>
      <div className="filter-drawer-panel__fields">
        <label className="field">
          <span className="field__label">Data inicial</span>
          <input
            type="date"
            value={draft.dateFrom}
            disabled={!!draft.cycleId}
            onChange={(e) => onChange({ ...draft, dateFrom: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Data final</span>
          <input
            type="date"
            value={draft.dateTo}
            disabled={!!draft.cycleId}
            onChange={(e) => onChange({ ...draft, dateTo: e.target.value })}
          />
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
        <label className="field">
          <span className="field__label">Usuário</span>
          <select value={draft.userId} onChange={(e) => onChange({ ...draft, userId: e.target.value })}>
            <option value="">Todos os usuários</option>
            {users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Departamento</span>
          <select value={draft.departmentId} onChange={(e) => onChange({ ...draft, departmentId: e.target.value })}>
            <option value="">Todos os departamentos</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Atividade</span>
          <select value={draft.activityTypeId} onChange={(e) => onChange({ ...draft, activityTypeId: e.target.value })}>
            <option value="">Todas as atividades</option>
            {activityTypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
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
    </>
  );
}

/** Painel Geral — visão consolidada do progresso de todos os colaboradores,
 * aberta a qualquer usuário autenticado (não é uma tela administrativa). */
export function OverviewPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftFilters, setDraftFilters] = useState<DraftFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DraftFilters>(EMPTY_FILTERS);

  const [cycles, setCycles] = useState<AwardCycle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [users, setUsers] = useState<RankingEntry[]>([]);

  useEffect(() => {
    api.get<AwardCycle[]>('/cycles?limit=100').then(({ data }) => setCycles(data)).catch(() => undefined);
    api.get<Department[]>('/departments').then(({ data }) => setDepartments(data)).catch(() => undefined);
    api.get<ActivityType[]>('/activity-types?status=ACTIVE').then(({ data }) => setActivityTypes(data)).catch(() => undefined);
    // limit=100 é o máximo aceito por /ranking (ver ListRankingQuerySchema) —
    // pedir mais que isso falha com 422 e deixaria a lista de usuários vazia.
    api.get<RankingEntry[]>('/ranking?limit=100').then(({ data }) => setUsers(data)).catch(() => undefined);
  }, []);

  const query = useMemo(() => buildFilterQuery(appliedFilters), [appliedFilters]);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<AdminDashboardData>(`/admin/dashboard${query}`)
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o painel geral.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [query]);

  /** Clicar no nome de um usuário (ranking ou legenda de gráfico) filtra o
   * painel inteiro por essa pessoa — aplica direto, sem precisar do botão
   * "Aplicar filtros". */
  function filterByUser(userId: string) {
    const next = { ...appliedFilters, userId };
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  const activeUserName = appliedFilters.userId ? users.find((u) => u.userId === appliedFilters.userId)?.name : undefined;

  if (loading && !dashboard) return <LoadingState label="Carregando painel geral…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dashboard) return null;

  const { indicators, topRanking, charts } = dashboard;

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Painel Geral</h1>
        <FilterDrawer hasActiveFilters={hasAnyFilter(appliedFilters)}>
          <FilterFields
            draft={draftFilters}
            onChange={setDraftFilters}
            onApply={() => setAppliedFilters(draftFilters)}
            onClear={() => {
              setDraftFilters(EMPTY_FILTERS);
              setAppliedFilters(EMPTY_FILTERS);
            }}
            cycles={cycles}
            departments={departments}
            activityTypes={activityTypes}
            users={users}
          />
        </FilterDrawer>
      </div>

      <div className="banner banner--motivational">
        {indicators.activeUsers} colaboradores ativos • {indicators.points.netCirculating.toLocaleString('pt-BR')} pts em circulação
        {indicators.topModality ? ` • Modalidade em alta: ${indicators.topModality.name}` : ''}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Colaboradores</span>
          <span className="stat-card__value">{indicators.activeUsers}</span>
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
          <span className="stat-card__value">{indicators.activities.approvedToday}</span>
        </div>
      </div>

      <CurrentCycleCard />

      {activeUserName && (
        <div className="banner banner--filter-active">
          Mostrando dados filtrados de <strong>{activeUserName}</strong>.
          <button type="button" className="btn btn--ghost btn--small" onClick={() => filterByUser('')}>
            Remover filtro de usuário
          </button>
        </div>
      )}

      <div className="grid-2">
        <PointsHistoryChart pointsHistory={charts.pointsHistory} />
        <ChartCard title="Atividades aprovadas (30 dias)">
          {(size) => (
            <LineChart
              data={charts.activitiesOverTime.map((p) => ({ label: p.date.slice(5), value: p.approvedCount, tooltipLabel: p.date }))}
              color="var(--color-success)"
              size={size}
            />
          )}
        </ChartCard>
      </div>

      <div className="grid-2">
        <ChartCard title="Top 5 atividades mais realizadas">
          {() =>
            charts.topActivities.length === 0 ? (
              <p className="chart-empty-message">Nenhuma atividade aprovada neste período.</p>
            ) : (
              <BarChart data={charts.topActivities.map((a) => ({ label: a.name, value: a.approvedCount }))} color="var(--color-warning)" />
            )
          }
        </ChartCard>
        <TopUsersEvolutionChart topUsersEvolution={charts.topUsersEvolution} onUserClick={filterByUser} />
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
                <Avatar name={e.name} avatarType={e.avatarType} avatarUrl={e.avatarUrl} userId={e.id} />
                <div className="ranking-row__info">
                  <button type="button" className="ranking-row__name ranking-row__name--clickable" onClick={() => filterByUser(e.id)} title={`Filtrar o painel por ${e.name}`}>
                    {e.name}
                  </button>
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
