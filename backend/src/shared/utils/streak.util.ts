/** Normaliza uma data pro dia de calendário (meia-noite local), em ms —
 * usado pra deduplicar/comparar dias ignorando hora. */
function toDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Maior sequência histórica de dias consecutivos (dedupe por dia de
 * calendário) — usado pela conquista STREAK_DAYS (ver achievement.service.ts). */
export function computeMaxStreakDays(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const uniqueDaysMs = Array.from(new Set(dates.map(toDayMs))).sort((a, b) => a - b);

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < uniqueDaysMs.length; i++) {
    if (uniqueDaysMs[i] - uniqueDaysMs[i - 1] === ONE_DAY_MS) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

/**
 * Sequência ATUAL de dias consecutivos com atividade aprovada, terminando
 * hoje ou ontem — diferente de computeMaxStreakDays (maior sequência de
 * TODOS os tempos, usada só pra conquista), esta é a sequência "viva" que
 * incentiva o uso diário (card do Dashboard + notificação de marco).
 *
 * Regra (igual Duolingo/Snapchat): a sequência não quebra até o dia
 * terminar sem nenhuma atividade — ou seja, se a pessoa já fez algo hoje,
 * conta a partir de hoje; se ainda não fez nada hoje mas fez ontem, a
 * sequência continua "viva" (ela ainda tem até o fim do dia de hoje pra não
 * quebrar), então conta a partir de ontem. Se não fez nem hoje nem ontem, a
 * sequência está quebrada (0).
 */
export function computeCurrentStreakDays(dates: Date[], referenceDate: Date = new Date()): number {
  if (dates.length === 0) return 0;

  const daySet = new Set(dates.map(toDayMs));
  const todayMs = toDayMs(referenceDate);
  const yesterdayMs = todayMs - ONE_DAY_MS;

  let cursor: number;
  if (daySet.has(todayMs)) {
    cursor = todayMs;
  } else if (daySet.has(yesterdayMs)) {
    cursor = yesterdayMs;
  } else {
    return 0;
  }

  let streak = 0;
  while (daySet.has(cursor)) {
    streak++;
    cursor -= ONE_DAY_MS;
  }
  return streak;
}
