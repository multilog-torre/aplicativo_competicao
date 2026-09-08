import { Level } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { TransactionClient } from '../../shared/types/prisma';
import { CreateLevelDTO, UpdateLevelDTO } from './level.dto';

export class LevelService {
  // ─── CRUD (configurável pelo administrador, sem alterar código) ──────────────

  public static async list() {
    return prisma.level.findMany({ orderBy: { minPoints: 'asc' } });
  }

  public static async getById(id: string) {
    const level = await prisma.level.findUnique({ where: { id } });
    if (!level) throw new NotFoundError(`Nível com ID '${id}' não foi encontrado.`);
    return level;
  }

  public static async create(dto: CreateLevelDTO, adminId: string) {
    const conflict = await prisma.level.findFirst({
      where: { OR: [{ levelNumber: dto.levelNumber }, { minPoints: dto.minPoints }] },
    });
    if (conflict) {
      throw new AppError(
        'Já existe um nível com o mesmo número ou a mesma pontuação mínima.',
        409,
        'CONFLICT',
      );
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.level.create({ data: dto });

      // Novo nível pode alterar a classificação correta de usuários já existentes.
      await this.recalculateAllUsers(tx);

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'CREATE',
          entity: 'Level',
          entityId: created.id,
          newValues: JSON.stringify(created),
        },
      });

      return created;
    });
  }

  public static async update(id: string, dto: UpdateLevelDTO, adminId: string) {
    const existing = await prisma.level.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Nível com ID '${id}' não foi encontrado.`);

    if (dto.levelNumber !== undefined || dto.minPoints !== undefined) {
      const conflict = await prisma.level.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.levelNumber !== undefined ? [{ levelNumber: dto.levelNumber }] : []),
            ...(dto.minPoints !== undefined ? [{ minPoints: dto.minPoints }] : []),
          ],
        },
      });
      if (conflict) {
        throw new AppError(
          'Já existe outro nível com o mesmo número ou a mesma pontuação mínima.',
          409,
          'CONFLICT',
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.level.update({ where: { id }, data: dto });

      // minPoints pode ter mudado — reclassifica todos os usuários pelas novas faixas.
      await this.recalculateAllUsers(tx);

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'UPDATE',
          entity: 'Level',
          entityId: updated.id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
        },
      });

      return updated;
    });
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.level.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Nível com ID '${id}' não foi encontrado.`);

    return prisma.$transaction(async (tx) => {
      // Remove a referência antes de excluir (a FK não é ON DELETE CASCADE/SET NULL)
      // e reclassifica esses usuários pelas faixas restantes logo em seguida.
      const affected = await tx.user.findMany({ where: { levelId: id }, select: { id: true } });
      await tx.user.updateMany({ where: { levelId: id }, data: { levelId: null } });
      await tx.level.delete({ where: { id } });
      await this.recalculateAllUsers(tx);

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'DELETE',
          entity: 'Level',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify({ reassignedUserIds: affected.map((u) => u.id) }),
        },
      });

      return { message: 'Nível excluído com sucesso. Usuários afetados foram reclassificados.' };
    });
  }

  // ─── Reclassificação automática de nível ──────────────────────────────────────

  private static async getLevelsDesc(client: TransactionClient | typeof prisma): Promise<Level[]> {
    return client.level.findMany({ orderBy: { minPoints: 'desc' } });
  }

  /**
   * Escolhe o nível correto para uma pontuação: o de maior minPoints que ainda
   * seja <= totalPoints. Se nenhum se encaixar (ex.: total negativo após uma
   * PENALTY), usa o nível de menor minPoints como piso — todo usuário sempre
   * tem um nível, nunca fica "sem nível" enquanto existir ao menos um configurado.
   */
  private static pickBestLevel(totalPoints: number, levelsDesc: Level[]): Level | null {
    if (levelsDesc.length === 0) return null;
    const match = levelsDesc.find((lvl) => lvl.minPoints <= totalPoints);
    return match ?? levelsDesc[levelsDesc.length - 1];
  }

  /**
   * Recalcula e atualiza o nível de UM usuário, dentro da mesma transação de
   * crédito de pontos (Fase 5/8) — cumprindo o passo "verificar nível" do
   * fluxo atômico de aprovação (planejamento.md §32).
   */
  public static async recalculateForUser(
    userId: string,
    totalPoints: number,
    tx: TransactionClient,
  ): Promise<{ changed: boolean; newLevel: Level | null }> {
    const levels = await this.getLevelsDesc(tx);
    const best = this.pickBestLevel(totalPoints, levels);

    const user = await tx.user.findUnique({ where: { id: userId }, select: { levelId: true, level: { select: { levelNumber: true } } } });
    if (!user) return { changed: false, newLevel: null };

    if ((best?.id ?? null) === user.levelId) {
      return { changed: false, newLevel: best };
    }

    await tx.user.update({ where: { id: userId }, data: { levelId: best?.id ?? null } });

    // Notifica apenas subida de nível (Fase 16) — uma queda por penalidade não é "conquista".
    const previousLevelNumber = user.level?.levelNumber ?? -1;
    if (best && best.levelNumber > previousLevelNumber) {
      await NotificationService.create(
        {
          userId,
          title: 'Novo nível alcançado! 🎉',
          message: `Você alcançou o nível ${best.name}!`,
          type: 'LEVEL_UP',
          referenceId: best.id,
        },
        tx,
      );
    }

    return { changed: true, newLevel: best };
  }

  /** Reclassifica todos os usuários — usado após qualquer alteração nas faixas de nível. */
  public static async recalculateAllUsers(tx: TransactionClient): Promise<{ updatedCount: number }> {
    const levels = await this.getLevelsDesc(tx);
    const users = await tx.user.findMany({ select: { id: true, totalPoints: true, levelId: true } });

    let updatedCount = 0;
    for (const user of users) {
      const best = this.pickBestLevel(user.totalPoints, levels);
      if ((best?.id ?? null) !== user.levelId) {
        await tx.user.update({ where: { id: user.id }, data: { levelId: best?.id ?? null } });
        updatedCount++;
      }
    }

    return { updatedCount };
  }
}
