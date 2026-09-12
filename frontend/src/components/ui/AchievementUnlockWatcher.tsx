import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Achievement } from '../../types/api';
import { AchievementIcon } from './Badge';

const POLL_INTERVAL_MS = 20000;

interface NotificationItem {
  id: string;
  type: string;
  referenceId: string | null;
}

/**
 * Sem WebSocket/SSE no projeto, "tempo real" aqui significa: verifica a
 * cada 20s se surgiu alguma notificação ACHIEVEMENT_UNLOCKED ainda não lida
 * e, quando surge, celebra com um toast animado (ícone + nome + pontos) —
 * sem precisar recarregar a página. Cada notificação exibida é marcada como
 * lida na hora, pra não celebrar a mesma conquista duas vezes.
 *
 * Mostra uma celebração de cada vez (fila), mesmo que várias conquistas
 * tenham sido desbloqueadas juntas na mesma transação de pontos.
 */
export function AchievementUnlockWatcher() {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const { data } = await api.get<NotificationItem[]>('/notifications?isRead=false&limit=20');
        const unlocks = data.filter((n) => n.type === 'ACHIEVEMENT_UNLOCKED' && n.referenceId && !seenRef.current.has(n.id));

        for (const n of unlocks) {
          seenRef.current.add(n.id);
          api.post(`/notifications/${n.id}/read`).catch(() => undefined);
          try {
            const { data: achievement } = await api.get<Achievement>(`/achievements/${n.referenceId}`);
            if (!cancelled) setQueue((prev) => [...prev, achievement]);
          } catch {
            // conquista pode ter sido excluída depois — ignora silenciosamente
          }
        }
      } catch {
        // sem conexão momentânea — tenta de novo no próximo ciclo
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Consome a fila uma celebração de cada vez — SÓ escolhe a próxima quando
  // nada está em exibição. Deliberadamente em dois efeitos separados: juntar
  // "escolher a próxima" e "agendar o timer de sumir" num único efeito
  // dependente de `current` cria um bug sutil — como o próprio efeito muda
  // `current`, o React o reexecuta e a limpeza (clearTimeout) cancela o timer
  // recém-criado antes dele disparar, e o toast nunca some sozinho.
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), 5500);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="achievement-toast-stack" role="status" aria-live="polite">
      <div className="achievement-toast" onClick={() => setCurrent(null)}>
        <div className="achievement-toast__icon">
          <AchievementIcon icon={current.icon} iconType={current.iconType} size={48} />
        </div>
        <div>
          <p className="achievement-toast__title">🏆 Nova conquista desbloqueada!</p>
          <p className="achievement-toast__name">{current.name}</p>
          {current.pointsReward > 0 && <p className="achievement-toast__points">+{current.pointsReward} pts</p>}
        </div>
      </div>
    </div>
  );
}
