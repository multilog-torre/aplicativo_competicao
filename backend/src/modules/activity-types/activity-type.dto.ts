import { z } from 'zod';

export const createActivityTypeSchema = z.object({
  name: z.string().min(2, 'O nome da modalidade deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  category: z.enum(['SPORTS', 'HEALTH', 'EDUCATION', 'SOCIAL', 'OTHER']).default('SPORTS'),
  icon: z.string().default('activity'),
  rulesDescription: z.string().optional(),
  scoringType: z.enum(['FIXED', 'QUANTITY', 'TIME', 'MULTIPLIER']).default('FIXED'),
  basePoints: z.number().int().min(1, 'A pontuação base deve ser de pelo menos 1 ponto'),
  unit: z.string().optional(),
  multiplier: z.number().positive('O multiplicador deve ser um valor positivo').default(1.0),
  dailyLimit: z.number().int().positive().optional(),
  weeklyLimit: z.number().int().positive().optional(),
  monthlyLimit: z.number().int().positive().optional(),
  requiresEvidence: z.boolean().default(true),
  allowedFileTypes: z.string().default('jpg,jpeg,png,pdf'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CreateActivityTypeDTO = z.infer<typeof createActivityTypeSchema>;

export const updateActivityTypeSchema = createActivityTypeSchema.partial();

export type UpdateActivityTypeDTO = z.infer<typeof updateActivityTypeSchema>;

export const listActivityTypesQuerySchema = z.object({
  category: z.enum(['SPORTS', 'HEALTH', 'EDUCATION', 'SOCIAL', 'OTHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().optional(),
});

export type ListActivityTypesQueryDTO = z.infer<typeof listActivityTypesQuerySchema>;
