import { z } from 'zod';

/**
 * Listagem da seção "Participantes" — busca por nome/cargo e filtro por
 * departamento, paginada e sempre ordenada alfabeticamente (é uma lista de
 * consulta, não um ranking; a posição no ranking é mostrada dentro do
 * perfil de cada participante, não aqui).
 */
export const ListParticipantsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').optional(),
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

export type ListParticipantsQueryDTO = z.infer<typeof ListParticipantsQuerySchema>;
