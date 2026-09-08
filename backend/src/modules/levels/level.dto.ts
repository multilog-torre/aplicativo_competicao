import { z } from 'zod';

export const CreateLevelSchema = z.object({
  levelNumber: z.number({ invalid_type_error: 'levelNumber deve ser um número.' }).int().positive(),
  name: z.string().min(2, 'O nome do nível deve ter pelo menos 2 caracteres.'),
  minPoints: z.number({ invalid_type_error: 'minPoints deve ser um número.' }).int().min(0),
  badgeIcon: z.string().default('award'),
  description: z.string().optional(),
});

export type CreateLevelDTO = z.infer<typeof CreateLevelSchema>;

export const UpdateLevelSchema = CreateLevelSchema.partial();

export type UpdateLevelDTO = z.infer<typeof UpdateLevelSchema>;
