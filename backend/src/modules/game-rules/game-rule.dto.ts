import { z } from 'zod';

export const CreateGameRuleStepSchema = z.object({
  stepNumber: z.number({ invalid_type_error: 'stepNumber deve ser um número.' }).int().positive(),
  title: z.string().min(2, 'O título deve ter pelo menos 2 caracteres.'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.'),
  icon: z.string().default('info'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CreateGameRuleStepDTO = z.infer<typeof CreateGameRuleStepSchema>;

export const UpdateGameRuleStepSchema = CreateGameRuleStepSchema.partial();

export type UpdateGameRuleStepDTO = z.infer<typeof UpdateGameRuleStepSchema>;
