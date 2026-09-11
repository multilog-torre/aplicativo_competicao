import { prisma } from '../../config/database';
import { ForbiddenError } from '../../shared/errors/AppError';

/**
 * Garante que o usuário pode ver/postar no "grupo" do Mural de um evento —
 * só quem participa dele (qualquer status: REGISTERED/ATTENDED/NO_SHOW) ou
 * admin. Não faz nada se eventId for null (post do Mural geral, sempre
 * visível a qualquer autenticado — regra que já existia).
 *
 * Usado tanto por posts quanto por comentários/curtidas de posts com
 * eventId, já que esses são recursos aninhados do mesmo post.
 */
export async function assertEventGroupAccess(eventId: string | null, userId: string, isAdmin: boolean): Promise<void> {
  if (!eventId || isAdmin) return;

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!participant) {
    throw new ForbiddenError('Você não tem acesso a este grupo — participe do evento para ver e enviar mensagens aqui.');
  }
}
