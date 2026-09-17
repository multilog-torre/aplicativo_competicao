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

// Na edição, diferente da criação, os três limites precisam aceitar `null`
// explícito — é o único jeito de REMOVER um limite já configurado (enviar o
// campo omitido significa "não alterar", não "desativar"). Na criação isso
// não é necessário: uma modalidade nova simplesmente nasce sem limite se o
// campo não for enviado.
export const updateActivityTypeSchema = createActivityTypeSchema.partial().extend({
  dailyLimit: z.number().int().positive().nullable().optional(),
  weeklyLimit: z.number().int().positive().nullable().optional(),
  monthlyLimit: z.number().int().positive().nullable().optional(),
});

export type UpdateActivityTypeDTO = z.infer<typeof updateActivityTypeSchema>;

export const listActivityTypesQuerySchema = z.object({
  category: z.enum(['SPORTS', 'HEALTH', 'EDUCATION', 'SOCIAL', 'OTHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().optional(),
});

export type ListActivityTypesQueryDTO = z.infer<typeof listActivityTypesQuerySchema>;
