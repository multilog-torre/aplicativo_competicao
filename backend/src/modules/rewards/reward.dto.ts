import { z } from 'zod';

export const CreateRewardSchema = z.object({
  title: z.string().min(2, 'O título deve ter pelo menos 2 caracteres.'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.'),
  imageUrl: z.string().optional(),
  pointsCost: z.number({ invalid_type_error: 'pointsCost deve ser um número.' }).int().positive(),
  quantityAvailable: z.number({ invalid_type_error: 'quantityAvailable deve ser um número.' }).int().min(0).default(0),
  status: z.enum(['AVAILABLE', 'OUT_OF_STOCK', 'INACTIVE']).default('AVAILABLE'),
});

export type CreateRewardDTO = z.infer<typeof CreateRewardSchema>;

export const UpdateRewardSchema = CreateRewardSchema.partial();

export type UpdateRewardDTO = z.infer<typeof UpdateRewardSchema>;

export const ListRewardsQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'OUT_OF_STOCK', 'INACTIVE']).optional(),
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

export type ListRewardsQueryDTO = z.infer<typeof ListRewardsQuerySchema>;

export const CancelRedemptionSchema = z.object({
  reason: z
    .string()
    .min(5, 'O motivo do cancelamento deve ter pelo menos 5 caracteres.')
    .max(500, 'O motivo deve ter no máximo 500 caracteres.'),
});

export type CancelRedemptionDTO = z.infer<typeof CancelRedemptionSchema>;

export const ListRedemptionsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(['REQUESTED', 'APPROVED', 'DELIVERED', 'CANCELLED']).optional(),
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

export type ListRedemptionsQueryDTO = z.infer<typeof ListRedemptionsQuerySchema>;
