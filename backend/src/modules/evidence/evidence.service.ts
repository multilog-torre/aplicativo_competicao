import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { UploadedFile } from '../../shared/types/upload';
import { assertAllowedFile } from '../../shared/utils/fileValidation';
import { getStorageProvider } from '../storage/storage.factory';

export type { UploadedFile };

export class EvidenceService {
  /**
   * Envia uma evidência (foto/PDF/comprovante) vinculada a uma atividade.
   * Apenas o autor da atividade pode enviar evidências, e apenas enquanto
   * ela estiver PENDING (ainda não avaliada pelo administrador).
   */
  public static async upload(activityId: string, userId: string, file: UploadedFile) {
    const activity = await prisma.userActivity.findUnique({
      where: { id: activityId },
      include: { activityType: true },
    });

    if (!activity) {
      throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
    }

    if (activity.userId !== userId) {
      throw new ForbiddenError('Você só pode enviar evidências para as suas próprias atividades.');
    }

    if (activity.status !== 'PENDING') {
      throw new AppError(
        'Não é possível enviar evidências para uma atividade que já foi avaliada.',
        422,
        'ACTIVITY_NOT_EDITABLE',
      );
    }

    const allowedExtensions = activity.activityType.allowedFileTypes
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean);

    assertAllowedFile(file, allowedExtensions);

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
      folder: `evidence/${activityId}`,
    });

    const evidence = await prisma.activityEvidence.create({
      data: {
        activityId,
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
        action: 'UPLOAD_EVIDENCE',
        entity: 'ActivityEvidence',
        entityId: evidence.id,
        newValues: JSON.stringify({ activityId, fileName: file.originalname, fileSize: file.size }),
      },
    });

    return this.toPublicShape(evidence, activityId);
  }

  /**
   * Lista as evidências de uma atividade (metadados apenas — nunca o caminho
   * físico do arquivo). Participante só vê as próprias; admin vê qualquer uma.
   */
  public static async listByActivity(activityId: string, requestingUserId: string, isAdmin: boolean) {
    const activity = await prisma.userActivity.findUnique({ where: { id: activityId } });
    if (!activity) {
      throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
    }
    if (!isAdmin && activity.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para visualizar evidências de outro usuário.');
    }

    const evidences = await prisma.activityEvidence.findMany({
      where: { activityId },
      orderBy: { createdAt: 'asc' },
    });

    return evidences.map((e) => this.toPublicShape(e, activityId));
  }

  /**
   * Recupera o conteúdo binário de uma evidência para download autorizado.
   * O arquivo NUNCA é exposto por URL pública direta — todo acesso passa
   * por aqui, validando que o solicitante é o dono da atividade ou um admin.
   */
  public static async getFileForDownload(activityId: string, evidenceId: string, requestingUserId: string, isAdmin: boolean) {
    const evidence = await prisma.activityEvidence.findUnique({
      where: { id: evidenceId },
      include: { activity: { select: { id: true, userId: true } } },
    });

    if (!evidence || evidence.activityId !== activityId) {
      throw new NotFoundError(`Evidência com ID '${evidenceId}' não foi encontrada.`);
    }

    if (!isAdmin && evidence.activity.userId !== requestingUserId) {
      throw new ForbiddenError('Você não tem permissão para acessar esta evidência.');
    }

    const storage = getStorageProvider();
    const buffer = await storage.read(evidence.storagePath);

    return { buffer, fileName: evidence.fileName, fileType: evidence.fileType };
  }

  private static toPublicShape(
    evidence: { id: string; activityId: string; fileName: string; fileType: string; fileSize: number; createdAt: Date },
    activityId: string,
  ) {
    return {
      id: evidence.id,
      fileName: evidence.fileName,
      fileType: evidence.fileType,
      fileSize: evidence.fileSize,
      createdAt: evidence.createdAt,
      downloadUrl: `/api/v1/activities/${activityId}/evidence/${evidence.id}/download`,
    };
  }
}
