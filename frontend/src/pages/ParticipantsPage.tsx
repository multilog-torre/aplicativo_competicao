import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Department, ParticipantEntry } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Avatar } from '../components/ui/Badge';
import { ParticipantProfileModal } from '../components/ui/ParticipantProfileModal';
import { ParticipantsIcon } from '../components/ui/icons';

/**
 * Seção "Participantes": todo mundo que compete, navegável por busca e
 * departamento (diferente do Ranking, que ordena por pontos — aqui a ordem é
 * sempre alfabética, é uma lista de consulta). Clicar em alguém abre o
 * perfil completo (data de nascimento/idade, atividades, badges, nível).
 */
export function ParticipantsPage() {
  const [entries, setEntries] = useState<ParticipantEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    if (departmentId) params.set('departmentId', departmentId);
    api
      .get<ParticipantEntry[]>(`/participants?${params.toString()}`)
      .then(({ data }) => setEntries(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os participantes.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [search, departmentId]);

  useEffect(() => {
    api
      .get<Department[]>('/departments')
      .then(({ data }) => setDepartments(data))
      .catch(() => undefined);
  }, []);

  return (
    <div className="page">
      <h1 className="page__title">Participantes</h1>
      <p className="page__subtitle">Conheça todos os competidores. Clique em alguém para ver o perfil completo.</p>

      <div className="form__row">
        <label className="field">
          <span className="field__label">Buscar por nome ou cargo</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Ana, Engenheiro…" />
        </label>
        <label className="field">
          <span className="field__label">Departamento</span>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">— Todos —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <LoadingState label="Carregando participantes…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && entries.length === 0 && <EmptyState icon={<ParticipantsIcon size={40} />} title="Nenhum participante encontrado" />}

      {!loading && !error && entries.length > 0 && (
        <ul className="ranking-list">
          {entries.map((p) => (
            <li key={p.id}>
              <button type="button" className="ranking-row participant-row" onClick={() => setSelectedId(p.id)}>
                <Avatar name={p.name} avatarType={p.avatarType} avatarUrl={p.avatarUrl} userId={p.id} />
                <div className="ranking-row__info">
                  <span className="ranking-row__name">{p.name}</span>
                  {(p.position || p.department) && (
                    <span className="ranking-row__department">
                      {[p.position, p.department?.name].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                {p.level && <span className="badge">{p.level.name}</span>}
                <span className="ranking-row__points">{p.totalPoints.toLocaleString('pt-BR')} pts</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && <ParticipantProfileModal userId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
