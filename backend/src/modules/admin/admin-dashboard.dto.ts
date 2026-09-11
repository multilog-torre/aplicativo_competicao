import { z } from 'zod';

/**
 * Filtros do Painel Geral — todos opcionais, combináveis entre si. Quando
 * nenhum filtro de data/ciclo é informado, cada gráfico usa sua janela
 * padrão (últimos 30 dias / 12 meses / 3 anos, conforme a granularidade).
 * `cycleId` tem prioridade sobre dateFrom/dateTo quando os dois vierem
 * juntos — nesse caso usa o período exato daquele ciclo de premiação.
 *
 * Os filtros afetam apenas os GRÁFICOS do painel (charts) — os cards de
 * indicador do topo (Colaboradores, Pontos distribuídos, Atividades
 * pendentes, Aprovadas hoje) continuam mostrando o estado atual/geral da
 * empresa, sem filtro, porque representam contadores "ao vivo" (decisão
 * combinada com o usuário).
 */
export const DashboardFiltersSchema = z
  .object({
    dateFrom: z.coerce.date({ invalid_type_error: 'Data inicial inválida.' }).optional(),
    dateTo: z.coerce.date({ invalid_type_error: 'Data final inválida.' }).optional(),
    cycleId: z.string().uuid('cycleId inválido.').optional(),
    userId: z.string().uuid('userId inválido.').optional(),
    departmentId: z.string().uuid('departmentId inválido.').optional(),
    activityTypeId: z.string().uuid('activityTypeId inválido.').optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: 'A data inicial deve ser anterior ou igual à data final.',
    path: ['dateTo'],
  });

export type DashboardFiltersDTO = z.infer<typeof DashboardFiltersSchema>;
