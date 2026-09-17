import { z } from 'zod';

/**
 * Chaves conhecidas hoje. Uma "Configurações" nova só precisa: 1) adicionar
 * a chave aqui, 2) tratar o parse/serialize dela em settings.service.ts —
 * nunca uma migração de banco nova (a tabela é key/value genérica).
 */
export const UpdateSettingsSchema = z.object({
  autoApproveActivities: z.boolean().optional(),
});

export type UpdateSettingsDTO = z.infer<typeof UpdateSettingsSchema>;
