import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { IMAGE_EVIDENCE_MIME_TYPES } from '../posts/post.dto';
import { PostService } from '../posts/post.service';
import { ScoringService } from '../scoring/scoring.service';
import { getStorageProvider } from '../storage/storage.factory';
import { computeCurrentStreakDays } from '../../shared/utils/streak.util';
import { ListPendingActivitiesQueryDTO, RejectActivityDTO } from './admin-activity.dto';

// Marcos de incentivo por sequência de dias seguidos com atividade aprovada
// (a pedido do usuário — "parabéns pelos X dias seguidos"), calibrados pra
// comemorar cedo (3 dias, prende o engajamento inicial) e depois espaçar
// mais (semanal → mensal), igual Duolingo/Headspace. Frases variam por
// marco pra não repetir a mesma mensagem genérica toda vez.
const STREAK_MILESTONE_MESSAGES: Record<number, string> = {
  3: '🔥 3 dias seguidos! Você pegou o ritmo — bora manter amanhã?',
  7: '🔥 Uma semana inteira sem folga! 7 dias seguidos, mandou bem.',
  14: '⚡ 14 dias seguidos! Duas semanas de dedicação total.',
  30: '🏆 30 dias seguidos! Isso não é mais esforço, é hábito. Parabéns!',
  60: '🚀 60 dias seguidos! Dois meses de consistência — você é referência.',
  100: '👑 100 dias seguidos! Marco histórico, poucos chegam até aqui.',
};

export class AdminActivityService {
  /**
   * Lista a fila de atividades aguardando avaliação administrativa,
   * ordenada da mais antiga para a mais recente (fila FIFO de revisão).
   */
  public static async listPending(query: ListPendingActivitiesQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: 'PENDING' };
    if (query.userId) where.userId = query.userId;
    if (query.activityTypeId) where.activityTypeId = query.activityTypeId;

    const [total, activities] = await Promise.all([
      prisma.userActivity.count({ where }),
      prisma.userActivity.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, corporateId: true, department: { select: { name: true } } } },
          activityType: { select: { id: true, name: true, icon: true, unit: true, requiresEvidence: true } },
          _count: { select: { evidences: true } },
        },
      }),
    ]);

    return {
      activities,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Aprova uma atividade PENDING.
   *
   * Operação atômica (planejamento.md §32): valida atividade → altera status →
   * cria points_transaction → atualiza total do usuário → cria auditoria.
   * Tudo dentro de uma ÚNICA transação de banco (BEGIN...COMMIT/ROLLBACK).
   *
   * Verificação de nível, conquistas e desafios ocorrem dentro de
   * ScoringService.creditPoints (Fases 11, 12 e 13). A notificação de
   * aprovação (Fase 16) é criada aqui, na mesma transação atômica.
   *
   * `adminId = null` significa aprovação AUTOMÁTICA — chamada por
   * ActivityService/EvidenceService quando a configuração "Aprovação
   * automática de atividades" está ativa (settings.service.ts), nunca por
   * uma pessoa. Reaproveita exatamente este mesmo método (mesmas
   * validações, mesmo motor de pontos) — só muda quem aparece como
   * responsável na auditoria e o texto da notificação. Desligar a
   * configuração não muda este método em nada: a fila manual de
   * aprovação (Admin > Aprovações) sempre funcionou e continua
   * funcionando do mesmo jeito, chamada com um adminId real.
   */
  public static async approve(activityId: string, adminId: string | null) {
    // Busca a evidência de imagem (se houver) e lê o arquivo do storage ANTES
    // de abrir a transação — storage.read() é uma chamada de rede externa
    // (Cloudinary), que pode demorar ou falhar por instabilidade de rede, e
    // NUNCA deve rodar dentro de uma transação de banco. Bug real já
    // aconteceu duas vezes em produção: o Prisma fecha a transação sozinho
    // depois do timeout padrão de 5s (interactive transaction), e a
    // aprovação inteira falha e desfaz tudo (status volta pra PENDING) bem
    // no fim, na chamada de prisma.post.create() — "Transaction already
    // closed" — mesmo a evidência já tendo sido salva com sucesso antes.
    // Buscar e ler o arquivo aqui fora, antes da transação, elimina esse
    // risco por completo: a transação em si passa a conter só operações de
    // banco, rápidas e previsíveis. Mesmo assim, o timeout explícito abaixo
    // (15s, acima do padrão de 5s do Prisma) fica como margem de segurança
    // extra — essa transação faz várias consultas em sequência (ranking,
    // nível, conquistas, sequência de dias, post do Mural).
    const imageEvidence = await prisma.activityEvidence.findFirst({
      where: { activityId, fileType: { in: IMAGE_EVIDENCE_MIME_TYPES } },
      orderBy: { createdAt: 'asc' },
    });

    let imageSource: { buffer: Buffer; fileName: string; mimeType: string } | undefined;
    if (imageEvidence) {
      const storage = getStorageProvider();
      const buffer = await storage.read(imageEvidence.storagePath);
      imageSource = { buffer, fileName: imageEvidence.fileName, mimeType: imageEvidence.fileType };
    }

    return prisma.$transaction(async (tx) => {
      const activity = await tx.userActivity.findUnique({
        where: { id: activityId },
        include: { activityType: true },
      });

      if (!activity) {
        throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
      }

      if (activity.status !== 'PENDING') {
        throw new AppError(
          `Esta atividade já foi avaliada anteriormente (status atual: ${activity.status}).`,
          422,
          'ACTIVITY_ALREADY_EVALUATED',
        );
      }

      // Integridade: se a modalidade exige comprovação, não permite aprovar sem evidência anexada
      if (activity.activityType.requiresEvidence) {
        const evidenceCount = await tx.activityEvidence.count({ where: { activityId } });
        if (evidenceCount === 0) {
          throw new AppError(
            'Esta modalidade exige comprovação e a atividade não possui nenhuma evidência anexada.',
            422,
            'EVIDENCE_REQUIRED',
          );
        }
      }

      const updatedActivity = await tx.userActivity.update({
        where: { id: activityId },
        data: {
          status: 'APPROVED',
          validatedAt: new Date(),
          validatedBy: adminId,
        },
      });

      const quantityLabel = activity.unit ? `${activity.quantity} ${activity.unit}` : `${activity.quantity}`;
      const creditResult = await ScoringService.creditPoints(
        {
          userId: activity.userId,
          points: activity.calculatedPoints,
          transactionType: 'ACTIVITY',
          description: `Pontuação referente a ${activity.activityType.name} (${quantityLabel}) - Atividade #${activity.id.slice(0, 8)}`,
          createdBy: adminId ?? undefined,
          activityId: activity.id,
          referenceType: 'UserActivity',
          referenceId: activity.id,
          // Ciclo é decidido pela data em que a atividade ACONTECEU, não
          // pelo momento em que ela é aprovada (pode ser dias depois numa
          // modalidade com evidência) — ver points-application.util.ts.
          cycleReferenceDate: activity.activityDate,
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: adminId ? 'APPROVE_ACTIVITY' : 'AUTO_APPROVE_ACTIVITY',
          entity: 'UserActivity',
          entityId: activity.id,
          oldValues: JSON.stringify({ status: 'PENDING' }),
          newValues: JSON.stringify({
            status: 'APPROVED',
            pointsCredited: activity.calculatedPoints,
            transactionId: creditResult.transaction.id,
          }),
        },
      });

      await NotificationService.create(
        {
          userId: activity.userId,
          title: 'Atividade aprovada! ✅',
          message: adminId
            ? `Sua atividade de ${activity.activityType.name} (${quantityLabel}) foi aprovada e você ganhou ${activity.calculatedPoints} pontos.`
            : `Sua atividade de ${activity.activityType.name} (${quantityLabel}) foi aprovada automaticamente e você ganhou ${activity.calculatedPoints} pontos.`,
          type: 'ACTIVITY_APPROVED',
          referenceId: activity.id,
        },
        tx,
      );

      // Notificação de incentivo por sequência de dias seguidos (a pedido do
      // usuário). Só dispara quando a atividade aprovada é de HOJE — aprovar
      // uma atividade atrasada de dias passados não deve gerar uma mensagem
      // de "parabéns" fora de contexto. E só na PRIMEIRA aprovação do dia
      // (senão repetiria a mesma mensagem a cada atividade extra aprovada no
      // mesmo dia, já que a sequência não muda de novo até o dia seguinte).
      const now = new Date();
      const isToday =
        activity.activityDate.getFullYear() === now.getFullYear() &&
        activity.activityDate.getMonth() === now.getMonth() &&
        activity.activityDate.getDate() === now.getDate();

      if (isToday) {
        const approvedDates = await tx.userActivity.findMany({
          where: { userId: activity.userId, status: 'APPROVED' },
          select: { activityDate: true },
        });
        const isFirstApprovalToday =
          approvedDates.filter(
            (a) =>
              a.activityDate.getFullYear() === now.getFullYear() &&
              a.activityDate.getMonth() === now.getMonth() &&
              a.activityDate.getDate() === now.getDate(),
          ).length === 1; // a própria atividade recém-aprovada já está incluída aqui

        if (isFirstApprovalToday) {
          const streakDays = computeCurrentStreakDays(approvedDates.map((a) => a.activityDate), now);
          const milestoneMessage = STREAK_MILESTONE_MESSAGES[streakDays];
          if (milestoneMessage) {
            await NotificationService.create(
              {
                userId: activity.userId,
                title: 'Sequência de dias! 🔥',
                message: milestoneMessage,
                type: 'STREAK_MILESTONE',
                referenceId: activity.id,
              },
              tx,
            );
          }
        }
      }

      // Publica automaticamente no Mural geral — todo colaborador vê no feed
      // (a pedido do usuário). Se houver evidência em formato de imagem, ela
      // já foi lida do storage ANTES desta transação abrir (imageSource,
      // acima) e é só copiada pro storage do próprio post aqui dentro (ver
      // PostService.createFromActivity).
      await PostService.createFromActivity(
        {
          userId: activity.userId,
          activityId: activity.id,
          content: `Registrou uma atividade de ${activity.activityType.name} (${quantityLabel}) e ganhou ${activity.calculatedPoints} pontos! 🎉`,
          imageSource,
        },
        tx,
      );

      return {
        activity: updatedActivity,
        transaction: creditResult.transaction,
        newTotalPoints: creditResult.newTotalPoints,
      };
    }, { timeout: 15000 });
  }

  /**
   * Rejeita uma atividade PENDING. Exige motivo. Nenhum ponto é creditado.
   */
  public static async reject(activityId: string, dto: RejectActivityDTO, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const activity = await tx.userActivity.findUnique({ where: { id: activityId } });

      if (!activity) {
        throw new NotFoundError(`Atividade com ID '${activityId}' não foi encontrada.`);
      }

      if (activity.status !== 'PENDING') {
        throw new AppError(
          `Esta atividade já foi avaliada anteriormente (status atual: ${activity.status}).`,
          422,
          'ACTIVITY_ALREADY_EVALUATED',
        );
      }

      const updatedActivity = await tx.userActivity.update({
        where: { id: activityId },
        data: {
          status: 'REJECTED',
          validatedAt: new Date(),
          validatedBy: adminId,
          rejectionReason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'REJECT_ACTIVITY',
          entity: 'UserActivity',
          entityId: activity.id,
          oldValues: JSON.stringify({ status: 'PENDING' }),
          newValues: JSON.stringify({ status: 'REJECTED', reason: dto.reason }),
        },
      });

      await NotificationService.create(
        {
          userId: activity.userId,
          title: 'Atividade rejeitada',
          message: `Sua atividade não foi aprovada. Motivo: ${dto.reason}`,
          type: 'ACTIVITY_REJECTED',
          referenceId: activity.id,
        },
        tx,
      );

      return updatedActivity;
    });
  }
}
