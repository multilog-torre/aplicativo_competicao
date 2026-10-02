import { z } from 'zod';

/**
 * `dateFrom`/`dateTo`/`cycleId` são os únicos filtros do Dashboard pessoal
 * (diferente do Painel Geral, que também tem usuário/departamento/
 * atividade) — aqui o "usuário" já é fixo, é a própria pessoa autenticada.
 * `cycleId` tem prioridade sobre dateFrom/dateTo quando os dois vierem
 * juntos. Afetam os gráficos (pointsHistory/activitiesByModality) e,
 * quando `cycleId` é informado, também o card de pontos do topo — que
 * passa a mostrar `points.periodTotal` (o saldo que a pessoa tinha
 * quando aquele ciclo fechou, reconstruído do ledger) em vez do saldo
 * atual. Ranking/nível/progresso continuam sempre o estado atual — não
 * fazem sentido "no passado" sem um histórico de snapshots que não
 * existe (ver rankingEvolution em dashboard.service.ts). Um
 * dateFrom/dateTo livre (sem cycleId) não altera o card de pontos, só
 * os gráficos — calcular "pontos no período" pra um intervalo arbitrário
 * pode atravessar um reset de ciclo no meio e dar um número sem sentido
 * de "saldo ao final de X", decisão do usuário.
 */
export const GetDashboardQuerySchema = z
  .object({
    activityLimit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 5))
      .pipe(z.number().int().positive().max(20)),
    dateFrom: z.coerce.date({ invalid_type_error: 'Data inicial inválida.' }).optional(),
    dateTo: z.coerce.date({ invalid_type_error: 'Data final inválida.' }).optional(),
    cycleId: z.string().uuid('cycleId inválido.').optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: 'A data inicial deve ser anterior ou igual à data final.',
    path: ['dateTo'],
  });

export type GetDashboardQueryDTO = z.infer<typeof GetDashboardQuerySchema>;
