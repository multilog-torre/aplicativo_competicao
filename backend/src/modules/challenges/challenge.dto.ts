import { z } from 'zod';

const BaseChallengeSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres.'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.'),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'startDate inválida.' }),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'endDate inválida.' }),
  activityTypeId: z.string().uuid('ID de modalidade inválido.').optional(),
  targetGoal: z.number({ invalid_type_error: 'targetGoal deve ser um número.' }).positive(),
  unit: z.string().optional(),
  rewardPoints: z.number().int().min(0).default(100),
  scope: z.enum(['INDIVIDUAL', 'DEPARTMENT', 'COMPANY']).default('INDIVIDUAL'),
  // UPCOMING/ACTIVE/COMPLETED são calculados a partir das datas (ver effectiveStatus).
  // O único estado que o administrador controla manualmente é o cancelamento.
  status: z.enum(['ACTIVE', 'CANCELLED']).default('ACTIVE'),
});

export const CreateChallengeSchema = BaseChallengeSchema.refine(
  (data) => new Date(data.startDate).getTime() < new Date(data.endDate).getTime(),
  { message: 'startDate deve ser anterior a endDate.', path: ['endDate'] },
);

export type CreateChallengeDTO = z.infer<typeof CreateChallengeSchema>;

export const UpdateChallengeSchema = BaseChallengeSchema.partial();

export type UpdateChallengeDTO = z.infer<typeof UpdateChallengeSchema>;

export const ListChallengesQuerySchema = z.object({
  effectiveStatus: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  scope: z.enum(['INDIVIDUAL', 'DEPARTMENT', 'COMPANY']).optional(),
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

export type ListChallengesQueryDTO = z.infer<typeof ListChallengesQuerySchema>;
