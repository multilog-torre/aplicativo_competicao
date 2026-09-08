import { z } from 'zod';

// ─── Simulação de Cálculo (Preview antes de submeter) ─────────────────────────
export const SimulateScoreSchema = z.object({
  activityTypeId: z.string().uuid('ID de modalidade inválido.'),
  quantity: z
    .number({ invalid_type_error: 'Quantidade deve ser um número.' })
    .positive('Quantidade deve ser maior que zero.')
    .max(99999, 'Quantidade excede o valor máximo permitido.'),
});

export type SimulateScoreDTO = z.infer<typeof SimulateScoreSchema>;

// ─── Lançamento Manual de Pontos (Admin) ──────────────────────────────────────
export const ManualTransactionSchema = z.object({
  userId: z.string().uuid('ID de usuário inválido.'),
  transactionType: z.enum(['BONUS', 'PENALTY', 'ADJUSTMENT'], {
    errorMap: () => ({
      message: "Tipo de transação manual deve ser 'BONUS', 'PENALTY' ou 'ADJUSTMENT'.",
    }),
  }),
  points: z
    .number({ invalid_type_error: 'Pontos deve ser um número.' })
    .int('Pontos deve ser um número inteiro.')
    .min(-100000, 'Valor fora do intervalo permitido.')
    .max(100000, 'Valor fora do intervalo permitido.')
    .refine((v) => v !== 0, { message: 'Pontos não pode ser zero.' }),
  description: z
    .string()
    .min(5, 'Descrição deve ter pelo menos 5 caracteres.')
    .max(500, 'Descrição deve ter no máximo 500 caracteres.'),
});

export type ManualTransactionDTO = z.infer<typeof ManualTransactionSchema>;

// ─── Reversão de Transação (Admin) ────────────────────────────────────────────
export const ReversalSchema = z.object({
  reason: z
    .string()
    .min(5, 'Motivo da reversão deve ter pelo menos 5 caracteres.')
    .max(500, 'Motivo deve ter no máximo 500 caracteres.'),
});

export type ReversalDTO = z.infer<typeof ReversalSchema>;

// ─── Filtros de Histórico de Transações ───────────────────────────────────────
export const ListTransactionsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  transactionType: z
    .enum(['ACTIVITY', 'BONUS', 'PENALTY', 'ADJUSTMENT', 'CHALLENGE', 'ACHIEVEMENT', 'REWARD', 'REVERSAL'])
    .optional(),
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

export type ListTransactionsQueryDTO = z.infer<typeof ListTransactionsQuerySchema>;
