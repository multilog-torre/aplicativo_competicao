import { z } from 'zod';

export const CreateCommentSchema = z.object({
  content: z.string().min(1, 'O comentário não pode estar vazio.').max(500, 'Máximo de 500 caracteres.'),
});

export type CreateCommentDTO = z.infer<typeof CreateCommentSchema>;

export const ListCommentsQuerySchema = z.object({
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

export type ListCommentsQueryDTO = z.infer<typeof ListCommentsQuerySchema>;
