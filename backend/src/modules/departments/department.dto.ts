import { z } from 'zod';

export const ListDepartmentsQuerySchema = z.object({
  // 'ALL' é usado pela tela administrativa para listar também os inativos
  // (permitindo reativá-los); por padrão (omitido), mantém-se só ACTIVE —
  // mesmo comportamento já usado por telas de perfil/cadastro.
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional(),
});

export type ListDepartmentsQueryDTO = z.infer<typeof ListDepartmentsQuerySchema>;

export const CreateDepartmentSchema = z.object({
  name: z.string().min(2, 'O nome do departamento deve ter no mínimo 2 caracteres'),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type CreateDepartmentDTO = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial();

export type UpdateDepartmentDTO = z.infer<typeof UpdateDepartmentSchema>;
