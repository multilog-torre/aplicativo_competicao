import { z } from 'zod';

/**
 * Campos pessoais reutilizados em três lugares distintos (autocadastro,
 * autoedição de perfil, criação/edição administrativa de usuário) — mantidos
 * aqui para os três nunca desalinharem as opções válidas.
 */
export const GenderSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);

export const BirthDateSchema = z.coerce
  .date({ invalid_type_error: 'Data de nascimento inválida.' })
  .refine((date) => date <= new Date(), { message: 'Data de nascimento não pode estar no futuro.' });
