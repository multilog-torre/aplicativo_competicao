import { z } from 'zod';

export const CreatePostSchema = z.object({
  content: z.string().min(1, 'A publicação não pode estar vazia.').max(2000, 'Máximo de 2000 caracteres.'),
  // Quando presente, a publicação é do "grupo" de um evento (só participantes
  // veem/postam — checado no service) em vez do Mural geral.
  eventId: z.string().uuid().optional(),
});

export type CreatePostDTO = z.infer<typeof CreatePostSchema>;

export const ListPostsQuerySchema = z.object({
  // Filtro por status só é honrado para ADMIN/ADMIN_MASTER (fila de moderação).
  status: z.enum(['PUBLISHED', 'HIDDEN', 'MODERATED']).optional(),
  eventId: z.string().uuid().optional(),
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

export type ListPostsQueryDTO = z.infer<typeof ListPostsQuerySchema>;

export const ModeratePostSchema = z.object({
  action: z.enum(['HIDE', 'MODERATE', 'RESTORE']),
  reason: z.string().min(5).max(500).optional(),
});

export type ModeratePostDTO = z.infer<typeof ModeratePostSchema>;

export const DeletePostSchema = z.object({
  reason: z.string().min(5).max(500).optional(),
});

export type DeletePostDTO = z.infer<typeof DeletePostSchema>;
