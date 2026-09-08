import { z } from 'zod';

export const RankingPeriodSchema = z.enum(['GENERAL', 'WEEK', 'MONTH', 'YEAR']).default('GENERAL');

export const ListRankingQuerySchema = z.object({
  period: RankingPeriodSchema,
  activityTypeId: z.string().uuid('ID de modalidade inválido.').optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().positive().max(100)),
});

export type ListRankingQueryDTO = z.infer<typeof ListRankingQuerySchema>;
