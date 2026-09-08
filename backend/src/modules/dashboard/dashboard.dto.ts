import { z } from 'zod';

export const GetDashboardQuerySchema = z.object({
  activityLimit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5))
    .pipe(z.number().int().positive().max(20)),
});

export type GetDashboardQueryDTO = z.infer<typeof GetDashboardQuerySchema>;
