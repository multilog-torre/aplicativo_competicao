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
