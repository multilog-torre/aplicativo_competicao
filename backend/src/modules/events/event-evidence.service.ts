import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { UploadedFile } from '../../shared/types/upload';
import { assertAllowedFile } from '../../shared/utils/fileValidation';
import { getStorageProvider } from '../storage/storage.factory';

// Eventos não têm um cadastro de "extensões permitidas" por evento (ao
// contrário de ActivityType) — uma lista fixa e genérica de foto/comprovante
// é suficiente aqui, já que a evidência é sempre "prova de que estive lá".
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];

export class EventEvidenceService {
  /**
   * Envia uma evidência (foto/comprovante) de presença num evento. Só o
   * próprio inscrito pode enviar a própria evidência, e só na janela entre o
   * evento já ter acontecido e a presença ainda não ter sido confirmada
   * (event.status ainda "APPROVED" — uma vez COMPLETED, o admin já decidiu e
   * o ledger de bônus já foi creditado, então não faz mais sentido aceitar
   * evidência nova). É sempre um APOIO à decisão do admin, nunca obrigatória
   * — decisão de negócio combinada com o usuário: o admin continua podendo
   * marcar presença sem nenhuma evidência anexada.
   */
  public static async upload(eventId: string, userId: string, file: UploadedFile) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundError(`Evento com ID '${eventId}' não foi encontrado.`);
    }

    const participant = await prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) {
      throw new ForbiddenError('Você precisa estar inscrito neste evento para enviar evidência.');
    }

    if (event.status !== 'APPROVED') {
      throw new AppError(
        'Só é possível enviar evidência de um evento aprovado cuja presença ainda não foi confirmada.',
        422,
        'EVENT_NOT_EVIDENCE_WINDOW',
      );
    }

    if (event.eventDate > new Date()) {
      throw new AppError('Só é possível enviar evidência depois que o evento acontecer.', 422, 'EVENT_NOT_HAPPENED_YET');
    }

    assertAllowedFile(file, ALLOWED_EXTENSIONS);

    const maxSizeBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new AppError(
        `O arquivo excede o tamanho máximo permitido de ${env.MAX_UPLOAD_SIZE_MB}MB.`,
        422,
        'FILE_TOO_LARGE',
      );
    }

    const storage = getStorageProvider();
    const { storagePath, storageUrl } = await storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: `event-evidence/${participant.id}`,
    });

    const evidence = await prisma.eventParticipantEvidence.create({
      data: {
        eventParticipantId: participant.id,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        storageProvider: storage.providerName,
        storagePath,
        storageUrl,
        uploadedBy: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPLOAD_EVENT_EVIDENCE',
        entity: 'EventParticipantEvidence',
        entityId: evidence.id,
        newValues: JSON.stringify({ eventId, fileName: file.originalname, fileSize: file.size }),
      },
    });

    return this.toPublicShape(evidence, eventId);
  }

  /** Lista as evidências que o PRÓPRIO usuário enviou pra um evento. */
  public static async listMine(eventId: string, userId: string) {
    const participant = await prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!participant) {
      throw new NotFoundError('Você não está inscrito neste evento.');
    }

    const evidences = await prisma.eventParticipantEvidence.findMany({
      where: { eventParticipantId: participant.id },
      orderBy: { createdAt: 'asc' },
    });

    return evidences.map((e) => this.toPublicShape(e, eventId));
  }

  /**
   * Recupera o conteúdo binário de uma evidência para download autorizado.
   * Nunca exposto por URL pública direta — só quem enviou ou um admin.
   */
  public static async getFileForDownload(eventId: string, evidenceId: string, requestingUserId: string, isAdmin: boolean) {
    const evidence = await prisma.eventParticipantEvidence.findUnique({
      where: { id: evidenceId },
      include: { eventParticipant: { select: { eventId: true, userId: true } } },
    });

    if (!evidence || evidence.eventParticipant.eventId !== eventId) {
      throw new NotFoundError(`Evidência com ID '${evidenceId}' não foi encontrada.`);
    }

    if (!isAdmin && evidence.eventParticipant.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para acessar esta evidência.');
    }

    const storage = getStorageProvider();
    const buffer = await storage.read(evidence.storagePath);

    return { buffer, fileName: evidence.fileName, fileType: evidence.fileType };
  }

  private static toPublicShape(
    evidence: { id: string; fileName: string; fileType: string; fileSize: number; createdAt: Date },
    eventId: string,
  ) {
    return {
      id: evidence.id,
      fileName: evidence.fileName,
      fileType: evidence.fileType,
      fileSize: evidence.fileSize,
      createdAt: evidence.createdAt,
      downloadUrl: `/api/v1/events/${eventId}/evidence/${evidence.id}/download`,
    };
  }
}
