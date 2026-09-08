import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { CreateGameRuleStepDTO, UpdateGameRuleStepDTO } from './game-rule.dto';

export class GameRuleService {
  /**
   * "Como funciona?" — lista pública e ordenada dos passos do jogo.
   * planejamento.md Fase 22/"22. REGRAS DO JOGO": as regras vêm do backend,
   * nunca fixas apenas no frontend, e são configuráveis pelo administrador.
   */
  public static async list(includeInactive: boolean) {
    return prisma.gameRuleStep.findMany({
      where: includeInactive ? {} : { status: 'ACTIVE' },
      orderBy: { stepNumber: 'asc' },
    });
  }

  public static async getById(id: string) {
    const step = await prisma.gameRuleStep.findUnique({ where: { id } });
    if (!step) throw new NotFoundError(`Passo de regra com ID '${id}' não foi encontrado.`);
    return step;
  }

  public static async create(dto: CreateGameRuleStepDTO, adminId: string) {
    const existing = await prisma.gameRuleStep.findUnique({ where: { stepNumber: dto.stepNumber } });
    if (existing) {
      throw new AppError(`Já existe um passo com o número ${dto.stepNumber}.`, 409, 'CONFLICT');
    }

    const created = await prisma.gameRuleStep.create({ data: dto });

    await prisma.auditLog.create({
      data: { userId: adminId, action: 'CREATE', entity: 'GameRuleStep', entityId: created.id, newValues: JSON.stringify(created) },
    });

    return created;
  }

  public static async update(id: string, dto: UpdateGameRuleStepDTO, adminId: string) {
    const existing = await prisma.gameRuleStep.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Passo de regra com ID '${id}' não foi encontrado.`);

    if (dto.stepNumber !== undefined && dto.stepNumber !== existing.stepNumber) {
      const conflict = await prisma.gameRuleStep.findUnique({ where: { stepNumber: dto.stepNumber } });
      if (conflict) throw new AppError(`Já existe outro passo com o número ${dto.stepNumber}.`, 409, 'CONFLICT');
    }

    const updated = await prisma.gameRuleStep.update({ where: { id }, data: dto });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'GameRuleStep',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return updated;
  }

  /**
   * Exclusão definitiva — diferente de Achievement/Reward/Challenge, um passo
   * de regras nunca é referenciado por points_transactions, então não há
   * histórico de ledger a preservar; a regra de ouro (nunca apagar o que tem
   * histórico) simplesmente não se aplica aqui.
   */
  public static async delete(id: string, adminId: string) {
    const existing = await prisma.gameRuleStep.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Passo de regra com ID '${id}' não foi encontrado.`);

    await prisma.gameRuleStep.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: adminId, action: 'DELETE', entity: 'GameRuleStep', entityId: id, oldValues: JSON.stringify(existing) },
    });

    return { message: 'Passo de regra excluído com sucesso.' };
  }
}
