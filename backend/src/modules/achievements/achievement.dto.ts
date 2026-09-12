import { z } from 'zod';

export const AchievementRuleTypeSchema = z.enum([
  'ACTIVITY_COUNT', // { count: N } — N+ atividades APROVADAS (qualquer modalidade)
  'TOTAL_POINTS', // { minPoints: N } — total de pontos do ledger >= N
  'STREAK_DAYS', // { days: N } — maior sequência histórica de dias consecutivos com atividade aprovada
  'SPECIFIC_MODALITY', // { activityTypeId, count? } — N+ atividades aprovadas de uma modalidade específica
  'CUMULATIVE_QUANTITY', // { activityTypeId, targetQuantity: N } — soma de quantity aprovada de uma modalidade >= N (ex.: 100km)
  'DISTINCT_MODALITIES', // { count: N } — atividade aprovada em N+ modalidades diferentes
  'RANKING_POSITION', // { maxPosition: N } — posição atual no ranking geral <= N (ex.: Top 3)
  'ACCOUNT_TENURE_DAYS', // { days: N } — N+ dias desde a criação da conta
]);

export const AchievementLevelSchema = z.enum(['BRONZE', 'PRATA', 'OURO']);
export const AchievementIconTypeSchema = z.enum(['EMOJI', 'UPLOAD']);

export const CreateAchievementSchema = z.object({
  name: z.string().min(2, 'O nome da conquista deve ter pelo menos 2 caracteres.'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.'),
  icon: z.string().default('trophy'),
  // Criar/editar por aqui sempre lida com o emoji/identificador em texto —
  // trocar por upload de imagem é uma ação própria (ver SetAchievementIconSchema).
  iconType: AchievementIconTypeSchema.default('EMOJI'),
  category: z.string().min(2, 'A categoria deve ter pelo menos 2 caracteres.').default('GERAL'),
  level: AchievementLevelSchema.default('BRONZE'),
  pointsReward: z.number().int().min(0).default(50),
  ruleType: AchievementRuleTypeSchema,
  // Validado em detalhe no service, pois a forma depende do ruleType.
  ruleValue: z.record(z.unknown()),
  // Opcional mesmo pra ruleTypes ligados a uma modalidade (SPECIFIC_MODALITY/
  // CUMULATIVE_QUANTITY) — o service preenche automaticamente a partir do
  // activityTypeId já presente dentro de ruleValue quando este campo não vem.
  activityTypeId: z.string().uuid('activityTypeId inválido.').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CreateAchievementDTO = z.infer<typeof CreateAchievementSchema>;

export const UpdateAchievementSchema = CreateAchievementSchema.partial();

export type UpdateAchievementDTO = z.infer<typeof UpdateAchievementSchema>;

/** Ícone enviado como upload (iconType='UPLOAD') — mesmo contrato do avatar. */
export const SetAchievementIconSchema = z.object({
  iconType: AchievementIconTypeSchema,
  icon: z.string().optional(), // emoji/identificador, exigido quando iconType='EMOJI'
});

export type SetAchievementIconDTO = z.infer<typeof SetAchievementIconSchema>;
