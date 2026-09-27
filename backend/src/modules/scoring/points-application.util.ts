import { TransactionClient } from '../../shared/types/prisma';

/**
 * Retorna o id do ciclo de premiação ACTIVE agora (dentro da janela
 * startDate..endDate, status ainda ACTIVE — não CLOSED/CANCELLED), ou
 * `null` se não houver nenhum rolando neste instante: antes do primeiro
 * ciclo existir, ou no intervalo entre um ciclo fechado e o próximo
 * começar. Usado pra decidir se um crédito de pontos conta pro "placar de
 * competição" (`User.totalPoints`) — ver ciclos.md.
 *
 * Fica num util isolado (não dentro de ScoringService nem CycleService)
 * de propósito: ScoringService.creditPoints chama isso, CycleService
 * chama ScoringService (pro CYCLE_RESET), e AchievementService/
 * ChallengeService também precisam — colocar em qualquer um dos três
 * criaria import circular.
 */
export async function getActiveCycleId(tx: TransactionClient): Promise<string | null> {
  const now = new Date();
  const cycle = await tx.awardCycle.findFirst({
    where: { status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } },
    select: { id: true },
  });
  return cycle?.id ?? null;
}

/**
 * Aplica o efeito de uma variação de pontos (positiva ou negativa) no
 * User, decidindo quais dos dois contadores são afetados:
 *
 * - `lifetimePoints`: marco vitalício, nunca resetado por ciclo — soma
 *   sempre, EXCETO no próprio lançamento de CYCLE_RESET (que é uma
 *   zeragem administrativa de placar, não uma perda real de conquista).
 *   Base das conquistas TOTAL_POINTS (Centena/Clube dos 1.000/Milionário
 *   de Pontos) — ver conquistas.md.
 * - `totalPoints`: o "placar de competição" que Ranking/Nível/Dashboard/
 *   Perfil exibem — só soma um GANHO NOVO (pontos positivos) quando havia
 *   um ciclo ACTIVE no momento do crédito (`cycleId !== null`). Débitos e
 *   correções (`bypassCycleGateForTotal`, ou o próprio CYCLE_RESET) SEMPRE
 *   aplicam, independente de ciclo — do contrário, um resgate de prêmio
 *   ou uma reversão que caísse bem no intervalo entre dois ciclos "sumiria"
 *   sem debitar de fato o saldo, abrindo uma brecha de pontos grátis.
 *
 * Decisão de negócio (a pedido do usuário): pontos GANHOS sem nenhum ciclo
 * rolando (antes do 1º ciclo, ou no intervalo entre dois) não contam pra
 * ranking/nível/dashboard/perfil — mas o lançamento sempre existe no
 * ledger (Regra de Ouro), só não é somado no placar.
 */
export async function applyPointsToUser(
  tx: TransactionClient,
  userId: string,
  points: number,
  opts: { cycleId: string | null; isCycleReset: boolean; bypassCycleGateForTotal?: boolean },
): Promise<{ totalPoints: number; lifetimePoints: number }> {
  const data: { totalPoints?: { increment: number }; lifetimePoints?: { increment: number } } = {};

  if (!opts.isCycleReset) {
    data.lifetimePoints = { increment: points };
  }

  const shouldApplyToTotal = opts.isCycleReset || opts.bypassCycleGateForTotal || opts.cycleId !== null;
  if (shouldApplyToTotal) {
    data.totalPoints = { increment: points };
  }

  return tx.user.update({
    where: { id: userId },
    data,
    select: { totalPoints: true, lifetimePoints: true },
  });
}
