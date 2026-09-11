import { z } from 'zod';

export const EVENT_CATEGORIES = ['CORRIDA', 'CAMINHADA', 'CICLISMO', 'ACADEMIA', 'ESPORTE_COLETIVO', 'OUTRO'] as const;

export const CreateEventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres.').max(150),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres.').max(1000),
  category: z.enum(EVENT_CATEGORIES, {
    errorMap: () => ({ message: `Categoria deve ser uma de: ${EVENT_CATEGORIES.join(', ')}.` }),
  }),
  eventDate: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'A data do evento deve ser no futuro.',
  }),
  location: z.string().max(200).optional(),
});

export type CreateEventDTO = z.infer<typeof CreateEventSchema>;

// REGRA DE OURO: quem cria o evento nunca escolhe a própria pontuação —
// o admin define o bônus só na hora de aprovar.
export const ApproveEventSchema = z.object({
  bonusPoints: z
    .number({ invalid_type_error: 'Pontos de bônus deve ser um número.' })
    .int('Pontos de bônus deve ser um número inteiro.')
    .positive('Pontos de bônus deve ser maior que zero.')
    .max(100000, 'Valor fora do intervalo permitido.'),
});

export type ApproveEventDTO = z.infer<typeof ApproveEventSchema>;

export const RejectEventSchema = z.object({
  reason: z.string().min(5, 'O motivo deve ter pelo menos 5 caracteres.').max(500),
});

export type RejectEventDTO = z.infer<typeof RejectEventSchema>;

// Lista de userIds que compareceram — quem não estiver aqui fica NO_SHOW
// automaticamente (não recebe o bônus).
export const ConfirmAttendanceSchema = z.object({
  attendedUserIds: z.array(z.string().uuid()),
});

export type ConfirmAttendanceDTO = z.infer<typeof ConfirmAttendanceSchema>;

export const ListEventsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED']).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  mine: z.enum(['true']).optional(), // atalho pra "eventos que eu criei", inclusive os PENDING/REJECTED
});

export type ListEventsQueryDTO = z.infer<typeof ListEventsQuerySchema>;
