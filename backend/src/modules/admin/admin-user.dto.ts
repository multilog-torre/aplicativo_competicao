import { z } from 'zod';

export const RoleNameSchema = z.enum(['PARTICIPANTE', 'ADMIN', 'ADMIN_MASTER']);

export const CreateUserSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  email: z.string().email('E-mail corporativo inválido.'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
  corporateId: z.string().optional(),
  position: z.string().optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').optional().nullable(),
  roles: z.array(RoleNameSchema).min(1, 'Selecione ao menos um perfil.').default(['PARTICIPANTE']),
});

export type CreateUserDTO = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  position: z.string().nullable().optional(),
  departmentId: z.string().uuid('ID de departamento inválido.').nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL']).optional(),
});

export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;

export const SetUserRolesSchema = z.object({
  roles: z.array(RoleNameSchema).min(1, 'Selecione ao menos um perfil.'),
});

export type SetUserRolesDTO = z.infer<typeof SetUserRolesSchema>;

export const ListUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: RoleNameSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL']).optional(),
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

export type ListUsersQueryDTO = z.infer<typeof ListUsersQuerySchema>;
