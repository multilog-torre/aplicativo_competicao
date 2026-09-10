import { z } from 'zod';

export const CyclePrizeSchema = z.object({
  position: z.number({ invalid_type_error: 'A posição deve ser um número.' }).int().min(1).max(3),
  title: z.string().min(2, 'O título do prêmio deve ter pelo menos 2 caracteres.').max(160),
  description: z.string().max(500).optional(),
});

export type CyclePrizeDTO = z.infer<typeof CyclePrizeSchema>;

export const CreateCycleSchema = z
  .object({
    name: z.string().min(2, 'O nome do ciclo deve ter pelo menos 2 caracteres.').max(120),
    startDate: z.coerce.date({ invalid_type_error: 'Data de início inválida.' }),
    endDate: z.coerce.date({ invalid_type_error: 'Data de fim inválida.' }),
    prizes: z.array(CyclePrizeSchema).max(3, 'No máximo 3 prêmios (1º, 2º e 3º lugar).').default([]),
  })
  .refine((data) => data.startDate < data.endDate, {
    message: 'A data de início deve ser anterior à data de fim.',
    path: ['endDate'],
  })
  .refine((data) => new Set(data.prizes.map((p) => p.position)).size === data.prizes.length, {
    message: 'Cada posição do pódio (1º/2º/3º) só pode ter um prêmio.',
    path: ['prizes'],
  });

export type CreateCycleDTO = z.infer<typeof CreateCycleSchema>;

export const UpdateCycleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  startDate: z.coerce.date({ invalid_type_error: 'Data de início inválida.' }).optional(),
  endDate: z.coerce.date({ invalid_type_error: 'Data de fim inválida.' }).optional(),
});

export type UpdateCycleDTO = z.infer<typeof UpdateCycleSchema>;

export const ListCyclesQuerySchema = z.object({
  effectiveStatus: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CLOSED', 'CANCELLED']).optional(),
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

export type ListCyclesQueryDTO = z.infer<typeof ListCyclesQuerySchema>;
