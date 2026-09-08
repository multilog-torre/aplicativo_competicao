import { z } from 'zod';

// ─── Filtros da Trilha de Auditoria ─────────────────────────────────────────────
export const ListAuditLogsQuerySchema = z.object({
  userId: z.string().uuid('ID de usuário inválido.').optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  dateFrom: z
    .string()
    .optional()
    .refine((v) => !v || !isNaN(Date.parse(v)), { message: 'dateFrom deve ser uma data válida.' }),
  dateTo: z
    .string()
    .optional()
    .refine((v) => !v || !isNaN(Date.parse(v)), { message: 'dateTo deve ser uma data válida.' }),
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

export type ListAuditLogsQueryDTO = z.infer<typeof ListAuditLogsQuerySchema>;
