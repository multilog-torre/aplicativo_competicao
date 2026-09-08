import { z } from 'zod';

// ─── Filtros da fila de atividades pendentes ───────────────────────────────────
export const ListPendingActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  activityTypeId: z.string().uuid().optional(),
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

export type ListPendingActivitiesQueryDTO = z.infer<typeof ListPendingActivitiesQuerySchema>;

// ─── Rejeição de Atividade (motivo obrigatório) ────────────────────────────────
export const RejectActivitySchema = z.object({
  reason: z
    .string()
    .min(5, 'O motivo da rejeição deve ter pelo menos 5 caracteres.')
    .max(500, 'O motivo deve ter no máximo 500 caracteres.'),
});

export type RejectActivityDTO = z.infer<typeof RejectActivitySchema>;
