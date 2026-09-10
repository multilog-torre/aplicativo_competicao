import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail corporativo inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
});

export type LoginDTO = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'O refresh token é obrigatório'),
});

export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;

/**
 * Autocadastro (tela de login -> "Criar conta"). Diferente da criação de
 * usuário pelo ADMIN_MASTER (admin-user.dto.ts), aqui a senha NUNCA é
 * escolhida pela pessoa — nasce com a senha padrão da empresa
 * (env.DEFAULT_USER_PASSWORD) e status PENDING_APPROVAL, exigindo aprovação
 * administrativa antes do primeiro login (planejamento.md — decisão de
 * negócio ampliando o escopo original, a pedido do usuário).
 */
export const registerSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
  email: z.string().email('E-mail corporativo inválido.'),
  corporateId: z.string().max(60).optional(),
  position: z.string().max(120).optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').optional(),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
