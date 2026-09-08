import { z } from 'zod';

export const SetAvatarSchema = z.object({
  avatarType: z.enum(['INITIALS', 'PRESET', 'UPLOAD']),
  // Obrigatório apenas quando avatarType='PRESET' (validado no service).
  presetId: z.string().optional(),
});

export type SetAvatarDTO = z.infer<typeof SetAvatarSchema>;

/**
 * Autoedição de dados básicos do perfil (nome, cargo, departamento).
 * Decisão de negócio (a pedido do usuário, ampliando o escopo original da
 * Fase 18, que só previa avatar): diferente de dados corporativos geridos
 * exclusivamente por RH/admin em outros sistemas, aqui o próprio colaborador
 * pode manter seu nome/cargo/departamento atualizados. Toda alteração é
 * auditada (action UPDATE_PROFILE) para preservar rastreabilidade.
 */
export const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120).optional(),
  position: z.string().max(120).nullable().optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').nullable().optional(),
});

export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>;
