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

// ─── Edição de Atividade (a pedido do usuário) ─────────────────────────────────
// Modalidade (activityTypeId) nunca é editável aqui — trocar de modalidade muda
// a fórmula de pontos e a exigência de evidência inteira; quem quiser isso
// registra uma atividade nova. Editar é só pra corrigir um dado digitado
// errado (quantidade/data/descrição) na MESMA atividade.
export const UpdateActivitySchema = z
  .object({
    activityDate: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), { message: 'Data da atividade inválida.' })
      .refine((v) => new Date(v).getTime() <= Date.now() + 60_000, {
        message: 'A data da atividade não pode ser no futuro.',
      })
      .optional(),
    quantity: z
      .number({ invalid_type_error: 'Quantidade deve ser um número.' })
      .positive('Quantidade deve ser maior que zero.')
      .max(99999, 'Quantidade excede o valor máximo permitido.')
      .optional(),
    description: z.string().max(1000, 'Descrição deve ter no máximo 1000 caracteres.').optional(),
  })
  .refine((data) => data.activityDate !== undefined || data.quantity !== undefined || data.description !== undefined, {
    message: 'Informe ao menos um campo para atualizar (data, quantidade ou descrição).',
  });

export type UpdateActivityDTO = z.infer<typeof UpdateActivitySchema>;

// ─── Filtros de Listagem ────────────────────────────────────────────────────────
export const ListActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(), // apenas ADMIN/ADMIN_MASTER podem usar
  activityTypeId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  // Usados pela seção de calendário (Meu Perfil / Atividades) para buscar só o mês exibido.
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Histórico de atividades (a pedido do usuário) — filtra pelo ciclo em que a
  // atividade pontuou de verdade (via PointsTransaction.cycleId), não por um
  // intervalo de data aproximado: a atribuição ao ciclo é decidida no momento
  // do crédito (cycleReferenceDate), não necessariamente pela activityDate.
  cycleId: z.string().uuid().optional(),
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
