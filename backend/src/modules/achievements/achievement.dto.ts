import { z } from 'zod';

export const AchievementRuleTypeSchema = z.enum([
  'ACTIVITY_COUNT', // { count: N } — N+ atividades APROVADAS (qualquer modalidade)
  'TOTAL_POINTS', // { minPoints: N } — total de pontos do ledger >= N
  'STREAK_DAYS', // { days: N } — maior sequência histórica de dias consecutivos com atividade aprovada
  'SPECIFIC_MODALITY', // { activityTypeId, count? } — N+ atividades aprovadas de uma modalidade específica
]);

export const CreateAchievementSchema = z.object({
  name: z.string().min(2, 'O nome da conquista deve ter pelo menos 2 caracteres.'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.'),
  icon: z.string().default('trophy'),
  pointsReward: z.number().int().min(0).default(50),
  ruleType: AchievementRuleTypeSchema,
  // Validado em detalhe no service, pois a forma depende do ruleType.
  ruleValue: z.record(z.unknown()),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CreateAchievementDTO = z.infer<typeof CreateAchievementSchema>;

export const UpdateAchievementSchema = CreateAchievementSchema.partial();

export type UpdateAchievementDTO = z.infer<typeof UpdateAchievementSchema>;
