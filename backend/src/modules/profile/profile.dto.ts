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

/**
 * Troca de senha pelo próprio usuário — necessária desde que o autocadastro
 * (auth.service.ts registerSchema) passou a existir: toda conta nova nasce
 * com a senha padrão da empresa, e a pessoa precisa conseguir trocá-la.
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
});

export type ChangePasswordDTO = z.infer<typeof ChangePasswordSchema>;
