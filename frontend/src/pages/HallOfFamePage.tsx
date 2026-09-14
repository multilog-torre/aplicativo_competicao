import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AwardCycle } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Avatar } from '../components/ui/Badge';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Hall da Fama — histórico de todos os ciclos de premiação já encerrados,
 * com o pódio de cada um. Aberto a qualquer usuário autenticado (a pedido
 * do usuário: "todos... conseguir ver os vencedores"), diferente da tela
 * "Ver pódio" de Admin > Ciclos (que é exclusiva de admin e só mostra um
 * ciclo por vez). Reaproveita GET /cycles, que já é uma rota pública.
 */
export function HallOfFamePage() {
  const [cycles, setCycles] = useState<AwardCycle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    api
      .get<AwardCycle[]>('/cycles?effectiveStatus=CLOSED&limit=100')
      .then(({ data }) => setCycles(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o Hall da Fama.'));
  }

  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!cycles) return <LoadingState label="Carregando o Hall da Fama…" />;

  // Ciclo mais recente primeiro (GET /cycles já ordena por startDate desc).
  return (
    <div className="page">
      <h1 className="page__title">🏆 Hall da Fama</h1>
      <p className="page__subtitle">O pódio de cada ciclo de premiação já encerrado.</p>

      {cycles.length === 0 && (
        <EmptyState icon="🏆" title="Nenhum ciclo encerrado ainda" description="Quando o primeiro ciclo terminar, o pódio dele aparece aqui." />
      )}

      {cycles.map((cycle) => (
        <section key={cycle.id} className="card">
          <div className="page__header">
            <h2 className="card__title">{cycle.name}</h2>
            <span className="field__hint">
              {new Date(cycle.startDate).toLocaleDateString('pt-BR')} — {new Date(cycle.endDate).toLocaleDateString('pt-BR')}
            </span>
          </div>

          {cycle.winners.length === 0 ? (
            <EmptyState icon="🤷" title="Nenhum vencedor registrado" description="Ninguém pontuou durante este ciclo." />
          ) : (
            <ul className="ranking-list">
              {cycle.winners.map((w) => {
                const prize = cycle.prizes.find((p) => p.position === w.position);
                return (
                  <li key={w.id} className="ranking-row">
                    <span className="ranking-row__position">{MEDALS[w.position] ?? `${w.position}º`}</span>
                    <Avatar name={w.user.name} avatarType={w.user.avatarType} avatarUrl={w.user.avatarUrl} userId={w.user.id} />
                    <div className="ranking-row__info">
                      <span className="ranking-row__name">{w.user.name}</span>
                      {prize && <span className="ranking-row__department">🎁 {prize.title}</span>}
                    </div>
                    <span className="ranking-row__points">{w.pointsAtClose.toLocaleString('pt-BR')} pts</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
