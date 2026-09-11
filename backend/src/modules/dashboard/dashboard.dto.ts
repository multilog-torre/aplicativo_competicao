import { z } from 'zod';

/**
 * `dateFrom`/`dateTo`/`cycleId` são os únicos filtros do Dashboard pessoal
 * (diferente do Painel Geral, que também tem usuário/departamento/
 * atividade) — aqui o "usuário" já é fixo, é a própria pessoa autenticada.
 * `cycleId` tem prioridade sobre dateFrom/dateTo quando os dois vierem
 * juntos. Afetam apenas os gráficos (pointsHistory/activitiesByModality),
 * nunca os cards de indicador do topo (pontuação/ranking/nível/progresso
 * são sempre o estado atual).
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
