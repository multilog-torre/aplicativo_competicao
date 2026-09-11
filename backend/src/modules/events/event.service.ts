import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { ScoringService } from '../scoring/scoring.service';
import {
  ApproveEventDTO,
  ConfirmAttendanceDTO,
  CreateEventDTO,
  ListEventsQueryDTO,
  RejectEventDTO,
} from './event.dto';

const EVENT_INCLUDE = {
  createdBy: { select: { id: true, name: true, avatarType: true, avatarUrl: true } },
  approvedBy: { select: { id: true, name: true } },
  _count: { select: { participants: true } },
};

type EventWithInclude = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/**
 * Formata um evento pra resposta pública, computando campos derivados a
 * partir da data (nunca armazenados) — mesmo padrão de effectiveStatus já
 * usado em Ciclos/Desafios.
 */
function toPublicShape(event: EventWithInclude, myParticipation?: { status: string } | null) {
  const now = new Date();
  const isPast = event.eventDate <= now;
  const { _count, ...rest } = event;
  return {
    ...rest,
    participantsCount: _count.participants,
    isPast,
    canJoin: event.status === 'APPROVED' && !isPast,
    myParticipationStatus: myParticipation?.status ?? null,
  };
}

export class EventService {
  /**
   * Eventos comunitários (corrida, academia, etc.) — QUALQUER usuário
   * autenticado pode propor um (Fase pedida pelo usuário). Decisões de
   * negócio combinadas antes de implementar:
   * - Regra de Ouro: quem cria nunca escolhe a própria pontuação — o
   *   admin define o bônus só na aprovação (ApproveEventSchema).
   * - Categoria é uma lista fixa própria de eventos (não reaproveita o
   *   cadastro de Modalidades).
   * - O bônus só é creditado depois que a data do evento passa e o admin
   *   confirma quem de fato compareceu (nunca automático ao só "entrar").
   */
  public static async list(query: ListEventsQueryDTO, requestingUserId: string | null, isAdmin: boolean) {
    const where: Record<string, unknown> = {};

    if (!isAdmin) {
      if (query.mine === 'true' && requestingUserId) {
        where.createdById = requestingUserId;
      } else {
        where.OR = [
          { status: { in: ['APPROVED', 'COMPLETED'] } },
          ...(requestingUserId ? [{ createdById: requestingUserId }] : []),
        ];
      }
    }

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    const events = await prisma.event.findMany({ where, orderBy: { eventDate: 'asc' }, include: EVENT_INCLUDE });

    const myParticipations = requestingUserId
      ? await prisma.eventParticipant.findMany({
          where: { userId: requestingUserId, eventId: { in: events.map((e) => e.id) } },
        })
      : [];
    const myParticipationByEvent = new Map(myParticipations.map((p) => [p.eventId, p]));

    return events.map((e) => toPublicShape(e, myParticipationByEvent.get(e.id)));
  }

  public static async getById(id: string, requestingUserId: string | null, isAdmin: boolean) {
    const event = await prisma.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);

    if (!isAdmin && event.status !== 'APPROVED' && event.status !== 'COMPLETED' && event.createdById !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar este evento.');
    }

    const myParticipation = requestingUserId
      ? await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: id, userId: requestingUserId } } })
      : null;

    return toPublicShape(event, myParticipation);
  }

  public static async create(dto: CreateEventDTO, userId: string) {
    const event = await prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        eventDate: dto.eventDate,
        location: dto.location,
        createdById: userId,
        status: 'PENDING',
      },
      include: EVENT_INCLUDE,
    });

    return toPublicShape(event, null);
  }

  /** Só o próprio criador, e só enquanto o evento ainda está PENDING (sem ninguém inscrito ainda). */
  public static async delete(id: string, userId: string, isAdmin: boolean) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (!isAdmin && event.createdById !== userId) {
      throw new ForbiddenError('Você só pode excluir eventos que você mesmo criou.');
    }
    if (event.status !== 'PENDING') {
      throw new AppError('Só é possível excluir um evento que ainda está pendente de aprovação.', 422, 'EVENT_NOT_PENDING');
    }

    await prisma.event.delete({ where: { id } });
    return { message: 'Evento excluído com sucesso.' };
  }

  public static async approve(id: string, dto: ApproveEventDTO, adminId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (event.status !== 'PENDING') {
      throw new AppError('Só é possível aprovar um evento que está pendente.', 422, 'EVENT_NOT_PENDING');
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: 'APPROVED', bonusPoints: dto.bonusPoints, approvedById: adminId, approvedAt: new Date() },
      include: EVENT_INCLUDE,
    });

    await NotificationService.create({
      userId: event.createdById,
      title: '🎉 Seu evento foi aprovado!',
      message: `O evento "${event.title}" foi aprovado e já está disponível para inscrições. Quem participar ganha ${dto.bonusPoints} pontos de bônus.`,
      type: 'EVENT_APPROVED',
      referenceId: id,
    });

    return toPublicShape(updated, null);
  }

  public static async reject(id: string, dto: RejectEventDTO, adminId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (event.status !== 'PENDING') {
      throw new AppError('Só é possível rejeitar um evento que está pendente.', 422, 'EVENT_NOT_PENDING');
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: dto.reason, approvedById: adminId, approvedAt: new Date() },
      include: EVENT_INCLUDE,
    });

    await NotificationService.create({
      userId: event.createdById,
      title: 'Seu evento não foi aprovado',
      message: `O evento "${event.title}" não foi aprovado. Motivo: ${dto.reason}`,
      type: 'EVENT_REJECTED',
      referenceId: id,
    });

    return toPublicShape(updated, null);
  }

  /** Cancela um evento aprovado antes dele acontecer (ex.: chuva, cancelamento do local). */
  public static async cancel(id: string, adminId: string) {
    const event = await prisma.event.findUnique({ where: { id }, include: { participants: true } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (event.status !== 'PENDING' && event.status !== 'APPROVED') {
      throw new AppError('Este evento não pode mais ser cancelado.', 422, 'EVENT_NOT_CANCELLABLE');
    }

    const updated = await prisma.event.update({ where: { id }, data: { status: 'CANCELLED' }, include: EVENT_INCLUDE });

    for (const participant of event.participants) {
      await NotificationService.create({
        userId: participant.userId,
        title: 'Evento cancelado',
        message: `O evento "${event.title}", em que você estava inscrito, foi cancelado.`,
        type: 'EVENT_REJECTED',
        referenceId: id,
      });
    }

    return toPublicShape(updated, null);
  }

  public static async join(id: string, userId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (event.status !== 'APPROVED') {
      throw new AppError('Este evento não está aberto para inscrições.', 422, 'EVENT_NOT_JOINABLE');
    }
    if (event.eventDate <= new Date()) {
      throw new AppError('Este evento já aconteceu — não é mais possível se inscrever.', 422, 'EVENT_ALREADY_HAPPENED');
    }

    const existing = await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
    if (existing) {
      throw new AppError('Você já está inscrito neste evento.', 409, 'ALREADY_REGISTERED');
    }

    return prisma.eventParticipant.create({ data: { eventId: id, userId, status: 'REGISTERED' } });
  }

  /** Só antes do evento acontecer — depois disso, a presença já é controlada pelo admin. */
  public static async leave(id: string, userId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);

    const participant = await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
    if (!participant) {
      throw new NotFoundError('Você não está inscrito neste evento.');
    }
    if (event.eventDate <= new Date()) {
      throw new AppError('Este evento já aconteceu — não é mais possível cancelar a inscrição.', 422, 'EVENT_ALREADY_HAPPENED');
    }

    await prisma.eventParticipant.delete({ where: { eventId_userId: { eventId: id, userId } } });
    return { message: 'Inscrição cancelada com sucesso.' };
  }

  /** Só admin, e só participantes cadastrados — usado na tela de confirmação de presença. */
  public static async listParticipants(id: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);

    return prisma.eventParticipant.findMany({
      where: { eventId: id },
      orderBy: { registeredAt: 'asc' },
      include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true, department: { select: { name: true } } } } },
    });
  }

  /**
   * Confirma presença (ATTENDED) dos participantes marcados; quem não
   * estiver na lista fica NO_SHOW. Só depois disso os pontos de bônus são
   * creditados — via ledger (ScoringService.creditPoints), nunca por
   * UPDATE direto (Regra de Ouro) — e o evento é travado em COMPLETED
   * pra nunca ser reprocessado.
   */
  public static async confirmAttendance(id: string, dto: ConfirmAttendanceDTO, adminId: string) {
    const event = await prisma.event.findUnique({ where: { id }, include: { participants: true } });
    if (!event) throw new NotFoundError(`Evento com ID '${id}' não foi encontrado.`);
    if (event.status !== 'APPROVED') {
      throw new AppError('Só é possível confirmar presença de um evento aprovado.', 422, 'EVENT_NOT_APPROVED');
    }
    if (event.eventDate > new Date()) {
      throw new AppError('Só é possível confirmar presença depois que o evento acontecer.', 422, 'EVENT_NOT_HAPPENED_YET');
    }
    if (!event.bonusPoints) {
      throw new AppError('Este evento não tem pontuação de bônus definida.', 422, 'EVENT_NO_BONUS');
    }

    const attendedSet = new Set(dto.attendedUserIds);
    const now = new Date();

    // 1. Marca presença/ausência de todo mundo e trava o evento em COMPLETED
    // NUMA MESMA transação — feito ANTES de creditar pontos, garantindo que
    // o evento nunca seja reprocessado mesmo que o passo 2 falhe parcialmente.
    await prisma.$transaction(async (tx) => {
      for (const participant of event.participants) {
        await tx.eventParticipant.update({
          where: { id: participant.id },
          data: {
            status: attendedSet.has(participant.userId) ? 'ATTENDED' : 'NO_SHOW',
            confirmedAt: now,
            confirmedById: adminId,
          },
        });
      }
      await tx.event.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now } });
    });

    // 2. Credita o bônus só de quem compareceu.
    for (const participant of event.participants) {
      if (!attendedSet.has(participant.userId)) continue;

      await ScoringService.creditPoints({
        userId: participant.userId,
        points: event.bonusPoints,
        transactionType: 'EVENT_BONUS',
        description: `Bônus por participação no evento "${event.title}".`,
        createdBy: adminId,
        referenceType: 'Event',
        referenceId: id,
      });

      await NotificationService.create({
        userId: participant.userId,
        title: `🎉 +${event.bonusPoints} pontos pelo evento!`,
        message: `Sua presença no evento "${event.title}" foi confirmada e você ganhou ${event.bonusPoints} pontos de bônus.`,
        type: 'EVENT_BONUS_CREDITED',
        referenceId: id,
      });
    }

    return this.getById(id, adminId, true);
  }
}
