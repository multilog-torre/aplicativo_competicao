import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateCycleDTO, CyclePrizeDTO, ListCyclesQueryDTO, UpdateCycleDTO } from './cycle.dto';

type EffectiveStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'CANCELLED';

/**
 * "COMPLETED" é um estado transitório: a data fim já passou mas o
 * fechamento automático (checkAndCloseExpiredCycles) ainda não rodou —
 * dura, na prática, só até a próxima requisição de leitura ou o próximo
 * tick do verificador periódico (server.ts).
 */
function computeEffectiveStatus(cycle: { status: string; startDate: Date; endDate: Date }): EffectiveStatus {
  if (cycle.status === 'CANCELLED') return 'CANCELLED';
  if (cycle.status === 'CLOSED') return 'CLOSED';
  const now = new Date();
  if (now < cycle.startDate) return 'UPCOMING';
  if (now > cycle.endDate) return 'COMPLETED';
  return 'ACTIVE';
}

function toPublicShape<T extends { status: string; startDate: Date; endDate: Date }>(cycle: T) {
  return { ...cycle, effectiveStatus: computeEffectiveStatus(cycle) };
}

const CYCLE_INCLUDE = {
  prizes: { orderBy: { position: 'asc' as const } },
  winners: {
    orderBy: { position: 'asc' as const },
    include: { user: { select: { id: true, name: true, avatarType: true, avatarUrl: true } } },
  },
};

export class CycleService {
  /**
   * Ciclos de Premiação — competição periódica com pódio (1º/2º/3º) e reset
   * geral de pontuação ao final. Decisão de negócio a pedido do usuário:
   * - O reset NUNCA apaga o ledger (Regra de Ouro, planejamento.md §10) —
   *   é um lançamento de ajuste (CYCLE_RESET) que devolve o total a 0,
   *   auditável como qualquer outra movimentação de pontos.
   * - Conquistas (achievements) permanecem vitalícias, nunca resetam —
   *   mudar isso quebraria a regra já aprovada e testada (Fase 12) de que
   *   uma conquista nunca é concedida duas vezes ao mesmo usuário.
   * - O encerramento é automático: assim que a data fim passa, o próximo
   *   acesso a este módulo (ou o verificador periódico em server.ts)
   *   fecha o ciclo sozinho, sem exigir uma ação manual do admin.
   */
  public static async list(query: ListCyclesQueryDTO) {
    await this.checkAndCloseExpiredCycles();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const cycles = await prisma.awardCycle.findMany({ orderBy: { startDate: 'desc' }, include: CYCLE_INCLUDE });
    let shaped = cycles.map(toPublicShape);
    if (query.effectiveStatus) {
      shaped = shaped.filter((c) => c.effectiveStatus === query.effectiveStatus);
    }

    const total = shaped.length;
    const skip = (page - 1) * limit;
    return { cycles: shaped.slice(skip, skip + limit), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** O ciclo em andamento agora, se existir — usado pra exibir "ciclo atual" no painel/dashboard. */
  public static async getCurrent() {
    await this.checkAndCloseExpiredCycles();
    const now = new Date();
    const current = await prisma.awardCycle.findFirst({
      where: { status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } },
      include: CYCLE_INCLUDE,
    });
    return current ? toPublicShape(current) : null;
  }

  public static async getById(id: string) {
    await this.checkAndCloseExpiredCycles();
    const cycle = await prisma.awardCycle.findUnique({ where: { id }, include: CYCLE_INCLUDE });
    if (!cycle) throw new NotFoundError(`Ciclo com ID '${id}' não foi encontrado.`);
    return toPublicShape(cycle);
  }

  public static async create(dto: CreateCycleDTO, adminId: string) {
    // Nenhum outro ciclo (exceto os já cancelados) pode se sobrepor no tempo —
    // evita ambiguidade sobre qual competição está valendo numa dada data.
    const overlapping = await prisma.awardCycle.findFirst({
      where: {
        status: { not: 'CANCELLED' },
        startDate: { lt: dto.endDate },
        endDate: { gt: dto.startDate },
      },
    });
    if (overlapping) {
      throw new AppError('Já existe um ciclo com período sobreposto a este.', 409, 'CYCLE_OVERLAP');
    }

    const created = await prisma.$transaction(async (tx) => {
      const cycle = await tx.awardCycle.create({
        data: { name: dto.name, startDate: dto.startDate, endDate: dto.endDate },
      });

      if (dto.prizes.length > 0) {
        await tx.cyclePrize.createMany({
          data: dto.prizes.map((p) => ({ cycleId: cycle.id, position: p.position, title: p.title, description: p.description })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'CREATE',
          entity: 'AwardCycle',
          entityId: cycle.id,
          newValues: JSON.stringify({ name: cycle.name, startDate: cycle.startDate, endDate: cycle.endDate, prizes: dto.prizes }),
        },
      });

      return tx.awardCycle.findUniqueOrThrow({ where: { id: cycle.id }, include: CYCLE_INCLUDE });
    });

    return toPublicShape(created);
  }

  public static async update(id: string, dto: UpdateCycleDTO, adminId: string) {
    const existing = await prisma.awardCycle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Ciclo com ID '${id}' não foi encontrado.`);

    if (existing.status !== 'ACTIVE') {
      throw new AppError('Só é possível editar um ciclo que ainda está ativo.', 422, 'CYCLE_NOT_EDITABLE');
    }
    if (new Date() >= existing.startDate && (dto.startDate !== undefined || dto.endDate !== undefined)) {
      throw new AppError('Não é possível alterar as datas de um ciclo que já começou.', 422, 'CYCLE_ALREADY_STARTED');
    }

    const nextStart = dto.startDate ?? existing.startDate;
    const nextEnd = dto.endDate ?? existing.endDate;
    if (nextStart >= nextEnd) {
      throw new AppError('A data de início deve ser anterior à data de fim.', 422, 'INVALID_DATE_RANGE');
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const overlapping = await prisma.awardCycle.findFirst({
        where: {
          id: { not: id },
          status: { not: 'CANCELLED' },
          startDate: { lt: nextEnd },
          endDate: { gt: nextStart },
        },
      });
      if (overlapping) {
        throw new AppError('Já existe um ciclo com período sobreposto a este.', 409, 'CYCLE_OVERLAP');
      }
    }

    const updated = await prisma.awardCycle.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
      },
      include: CYCLE_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'AwardCycle',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, startDate: existing.startDate, endDate: existing.endDate }),
        newValues: JSON.stringify({ name: updated.name, startDate: updated.startDate, endDate: updated.endDate }),
      },
    });

    return toPublicShape(updated);
  }

  /** Cria ou substitui o prêmio de uma posição específica do pódio (1º/2º/3º). */
  public static async upsertPrize(cycleId: string, dto: CyclePrizeDTO, adminId: string) {
    const cycle = await prisma.awardCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new NotFoundError(`Ciclo com ID '${cycleId}' não foi encontrado.`);
    if (cycle.status !== 'ACTIVE') {
      throw new AppError('Só é possível configurar prêmios de um ciclo ativo.', 422, 'CYCLE_NOT_EDITABLE');
    }

    const prize = await prisma.cyclePrize.upsert({
      where: { cycleId_position: { cycleId, position: dto.position } },
      update: { title: dto.title, description: dto.description },
      create: { cycleId, position: dto.position, title: dto.title, description: dto.description },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPSERT',
        entity: 'CyclePrize',
        entityId: prize.id,
        newValues: JSON.stringify(dto),
      },
    });

    return prize;
  }

  /** Cancela um ciclo antes dele encerrar normalmente — não dispara pódio nem reset. */
  public static async cancel(id: string, adminId: string) {
    const existing = await prisma.awardCycle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Ciclo com ID '${id}' não foi encontrado.`);
    if (existing.status === 'CLOSED') {
      throw new AppError('Não é possível cancelar um ciclo que já foi encerrado.', 422, 'CYCLE_ALREADY_CLOSED');
    }
    if (existing.status === 'CANCELLED') {
      throw new AppError('Este ciclo já está cancelado.', 422, 'CYCLE_ALREADY_CANCELLED');
    }

    const updated = await prisma.awardCycle.update({ where: { id }, data: { status: 'CANCELLED' }, include: CYCLE_INCLUDE });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CANCEL',
        entity: 'AwardCycle',
        entityId: id,
        oldValues: JSON.stringify({ status: existing.status }),
        newValues: JSON.stringify({ status: 'CANCELLED' }),
      },
    });

    return toPublicShape(updated);
  }

  /**
   * Só permite excluir de fato um ciclo que ainda nem começou (sem nenhum
   * histórico associado) — depois de iniciado, a forma correta de
   * interromper é cancelar (preserva o registro do que aconteceu).
   */
  public static async delete(id: string, adminId: string) {
    const existing = await prisma.awardCycle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Ciclo com ID '${id}' não foi encontrado.`);
    if (new Date() >= existing.startDate) {
      throw new AppError('Este ciclo já começou — utilize "Cancelar" em vez de excluir.', 422, 'CYCLE_ALREADY_STARTED');
    }

    await prisma.awardCycle.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'DELETE',
        entity: 'AwardCycle',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, startDate: existing.startDate, endDate: existing.endDate }),
      },
    });

    return { message: 'Ciclo excluído com sucesso.' };
  }

  // ─── Encerramento automático ────────────────────────────────────────────────

  /**
   * Verifica ciclos ACTIVE cuja data fim já passou e os encerra. Chamado a
   * cada leitura deste módulo (garante correção imediata pra quem estiver
   * olhando) e periodicamente em server.ts (garante que o pódio/reset
   * aconteça mesmo que ninguém esteja consultando a API naquele momento —
   * ressalva: como o Render free tier hiberna por inatividade, o
   * encerramento de fato só roda quando o servidor está desperto).
   */
  public static async checkAndCloseExpiredCycles(): Promise<void> {
    const now = new Date();
    const expired = await prisma.awardCycle.findMany({
      where: { status: 'ACTIVE', endDate: { lt: now } },
      select: { id: true },
    });

    for (const cycle of expired) {
      await this.closeCycle(cycle.id);
    }
  }

  private static async closeCycle(cycleId: string): Promise<void> {
    const cycle = await prisma.awardCycle.findUniqueOrThrow({ where: { id: cycleId }, include: { prizes: true } });
    const prizeByPosition = new Map(cycle.prizes.map((p) => [p.position, p]));

    // 1. Pódio: top 3 por totalPoints (representa os pontos ganhos desde o
    // último reset — seja o início do sistema, seja o ciclo anterior). Em
    // caso de empate exato, o desempate NUNCA é por ordem alfabética do
    // nome — isso decidiria arbitrariamente quem leva qual prêmio, se as
    // posições tiverem prêmios diferentes. Ver rankWithTiebreak().
    const candidates = await prisma.user.findMany({
      where: { status: 'ACTIVE', totalPoints: { gt: 0 } },
      select: { id: true, name: true, totalPoints: true },
    });
    const topUsers = (await this.rankWithTiebreak(candidates, cycle.startDate)).slice(0, 3);

    // 2. Registra o pódio e marca o ciclo como CLOSED numa única transação —
    // feito ANTES do reset para garantir que o ciclo nunca seja reprocessado
    // (e o pódio nunca recalculado) mesmo que o passo 3 falhe parcialmente.
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < topUsers.length; i++) {
        await tx.cycleWinner.create({
          data: { cycleId, userId: topUsers[i].id, position: i + 1, pointsAtClose: topUsers[i].totalPoints },
        });
      }
      await tx.awardCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: new Date() } });
    });

    const winnerIds = new Set(topUsers.map((u) => u.id));
    for (let i = 0; i < topUsers.length; i++) {
      const position = i + 1;
      const prize = prizeByPosition.get(position);
      const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉';
      await NotificationService.create({
        userId: topUsers[i].id,
        title: `${medal} Você ficou em ${position}º lugar no ciclo!`,
        message: prize
          ? `Parabéns! Você terminou o ciclo "${cycle.name}" em ${position}º lugar e ganhou: ${prize.title}.`
          : `Parabéns! Você terminou o ciclo "${cycle.name}" em ${position}º lugar.`,
        type: 'CYCLE_ENDED',
        referenceId: cycleId,
      });
    }

    // 3. Reset geral: TODO usuário ativo com pontos != 0 recebe um
    // lançamento de ajuste que devolve o total a 0 — nunca por UPDATE
    // direto (Regra de Ouro, planejamento.md §10). O nível é recalculado
    // automaticamente como consequência (ScoringService.creditPoints já
    // chama LevelService.recalculateForUser).
    // Nomes do pódio, pra quem NÃO ganhou também saber quem ganhou — a
    // notificação de pódio (acima) já é pessoal e específica pra cada
    // vencedor; esta aqui é o "anúncio" que todo o resto da empresa recebe.
    const podiumNames = topUsers.map((u, i) => `${i + 1}º ${u.name}`).join(', ');
    const announcementSuffix = podiumNames ? ` Pódio: ${podiumNames}.` : '';

    const allUsers = await prisma.user.findMany({ where: { status: 'ACTIVE', totalPoints: { not: 0 } }, select: { id: true, totalPoints: true } });
    for (const user of allUsers) {
      await ScoringService.creditPoints({
        userId: user.id,
        points: -user.totalPoints,
        transactionType: 'CYCLE_RESET',
        description: `Reset de pontuação — encerramento do ciclo "${cycle.name}".`,
        referenceType: 'AwardCycle',
        referenceId: cycleId,
      });

      // Quem já recebeu a notificação de pódio acima não precisa de mais uma.
      if (!winnerIds.has(user.id)) {
        await NotificationService.create({
          userId: user.id,
          title: 'Novo ciclo começou! 🔄',
          message: `O ciclo "${cycle.name}" foi encerrado e as pontuações foram reiniciadas.${announcementSuffix} Boa sorte no próximo!`,
          type: 'CYCLE_ENDED',
          referenceId: cycleId,
        });
      }
    }
  }

  /**
   * Ordena candidatos ao pódio por pontuação (desc). Em empate exato, NUNCA
   * desempata por ordem alfabética do nome — decisão combinada com o
   * usuário, porque isso influenciaria diretamente quem leva qual prêmio de
   * forma arbitrária. O critério de desempate é QUEM CHEGOU NAQUELE TOTAL
   * PRIMEIRO dentro do ciclo: para cada candidato, soma cronologicamente as
   * transações de pontos dele desde o início do ciclo e marca o instante em
   * que essa soma atingiu (ou superou) o total final — quem chegou lá mais
   * cedo vence o empate. Nome só entra como ÚLTIMO critério, no caso
   * raríssimo dos dois terem chegado no exato mesmo instante (ex.: dois
   * lançamentos manuais em lote, mesmo timestamp).
   *
   * Quem não tem nenhuma transação dentro do período do ciclo (ex.: já
   * carregava o total inteiro de antes do ciclo começar, sem fazer nada
   * durante ele) é tratado como tendo "chegado" no início do ciclo — o
   * melhor desempate possível, e o único jeito consistente de lidar com
   * esse caso de borda sem inventar uma data arbitrária.
   */
  private static async rankWithTiebreak(
    candidates: Array<{ id: string; name: string; totalPoints: number }>,
    cycleStartDate: Date,
  ): Promise<Array<{ id: string; name: string; totalPoints: number }>> {
    if (candidates.length === 0) return [];

    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId: { in: candidates.map((c) => c.id) }, createdAt: { gte: cycleStartDate } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, points: true, createdAt: true },
    });

    const finalByUser = new Map(candidates.map((c) => [c.id, c.totalPoints]));
    const runningByUser = new Map<string, number>();
    const reachedAtByUser = new Map<string, Date>();

    for (const tx of transactions) {
      const running = (runningByUser.get(tx.userId) ?? 0) + tx.points;
      runningByUser.set(tx.userId, running);
      const final = finalByUser.get(tx.userId);
      if (final !== undefined && !reachedAtByUser.has(tx.userId) && running >= final) {
        reachedAtByUser.set(tx.userId, tx.createdAt);
      }
    }

    const reachedAt = (id: string) => reachedAtByUser.get(id) ?? cycleStartDate;

    return [...candidates].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      const diff = reachedAt(a.id).getTime() - reachedAt(b.id).getTime();
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }
}
