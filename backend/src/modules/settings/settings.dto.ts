import { z } from 'zod';

/**
 * Chaves conhecidas hoje. Uma "Configurações" nova só precisa: 1) adicionar
 * a chave aqui, 2) tratar o parse/serialize dela em settings.service.ts —
 * nunca uma migração de banco nova (a tabela é key/value genérica).
 */
export const UpdateSettingsSchema = z.object({
  autoApproveActivities: z.boolean().optional(),
  // `null` explícito remove o corte (volta a contar tudo, vida toda).
  // `undefined` (campo omitido) não mexe no valor atual.
  achievementsCountSince: z.coerce.date().nullable().optional(),
});

export type UpdateSettingsDTO = z.infer<typeof UpdateSettingsSchema>;
