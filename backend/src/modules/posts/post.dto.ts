import emojiRegexFn from 'emoji-regex';
import { z } from 'zod';

const EMOJI_REGEX = emojiRegexFn();

/** true só quando a string INTEIRA é exatamente 1 emoji (qualquer um do Unicode, incluindo sequências ZWJ/variação/tom de pele) — nunca texto solto nem múltiplos emojis colados. */
function isSingleEmoji(value: string): boolean {
  if (value.length === 0 || value.length > 32) return false;
  const matches = value.match(EMOJI_REGEX);
  return !!matches && matches.length === 1 && matches[0] === value;
}

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

// Qualquer emoji do Unicode é aceito (a pedido do usuário — antes era um
// conjunto fixo de 5). Validado com emoji-regex, não é texto livre: o
// backend rejeita qualquer coisa que não seja exatamente 1 emoji. Continua
// 1 reação por pessoa/post (ou por pessoa/comentário), trocável — ver
// PostReaction/CommentReaction no schema.
export const ReactionEmojiSchema = z
  .string()
  .refine(isSingleEmoji, 'Precisa ser um único emoji válido.');

export type ReactionEmojiCode = string;

export const SetReactionSchema = z.object({
  emoji: ReactionEmojiSchema,
});

export type SetReactionDTO = z.infer<typeof SetReactionSchema>;

// Formatos de evidência que viram foto de post (manual ou automático de
// atividade aprovada) — outros formatos (PDF, vídeo etc.) não têm como
// virar imagem no card, só o texto do post em si.
export const IMAGE_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
