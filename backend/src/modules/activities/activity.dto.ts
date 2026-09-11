import { z } from 'zod';

// ─── Registro de Atividade (Fase 6) ────────────────────────────────────────────
// REGRA DE OURO: o frontend nunca envia pontos. Apenas activityTypeId + quantity.
// O backend é a única fonte de cálculo (ScoringService).
export const CreateActivitySchema = z.object({
  activityTypeId: z.string().uuid('ID de modalidade inválido.'),
  activityDate: z
    .string({ required_error: 'A data da atividade é obrigatória.' })
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Data da atividade inválida.' })
    .refine((v) => new Date(v).getTime() <= Date.now() + 60_000, {
      message: 'A data da atividade não pode ser no futuro.',
    }),
  quantity: z
    .number({ invalid_type_error: 'Quantidade deve ser um número.' })
    .positive('Quantidade deve ser maior que zero.')
    .max(99999, 'Quantidade excede o valor máximo permitido.')
    .default(1),
  description: z
    .string()
    .max(1000, 'Descrição deve ter no máximo 1000 caracteres.')
    .optional(),
});

export type CreateActivityDTO = z.infer<typeof CreateActivitySchema>;

// ─── Filtros de Listagem ────────────────────────────────────────────────────────
export const ListActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(), // apenas ADMIN/ADMIN_MASTER podem usar
  activityTypeId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  // Usados pela seção de calendário (Meu Perfil / Atividades) para buscar só o mês exibido.
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
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

export type ListActivitiesQueryDTO = z.infer<typeof ListActivitiesQuerySchema>;
