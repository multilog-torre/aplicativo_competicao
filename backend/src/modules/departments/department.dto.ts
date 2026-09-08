import { z } from 'zod';

export const ListDepartmentsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type ListDepartmentsQueryDTO = z.infer<typeof ListDepartmentsQuerySchema>;
