import { prisma } from '../../config/database';
import { UpdateSettingsDTO } from './settings.dto';

/** Chaves conhecidas da tabela genérica `system_settings`. */
const AUTO_APPROVE_ACTIVITIES_KEY = 'AUTO_APPROVE_ACTIVITIES';
const ACHIEVEMENTS_COUNT_SINCE_KEY = 'ACHIEVEMENTS_COUNT_SINCE';

/**
 * Configurações do sistema — hoje só a de aprovação automática de
 * atividades, mas a tabela por trás (`SystemSetting`, key/value) foi
 * pensada pra caber outros switches futuros sem migração de banco nova.
 *
 * Decisão de negócio (a pedido do usuário): o switch é GLOBAL — vale pra
 * TODAS as modalidades de uma vez, nunca por modalidade — e mora no banco
 * (não em variável de ambiente), justamente pra o ADMIN_MASTER poder
 * ligar/desligar direto numa tela, sem precisar de deploy nem reiniciar o
 * servidor.
 */
export class SettingsService {
  /** Retrato completo das configurações, pra a tela "Configurações". */
  public static async get() {
    return {
      autoApproveActivities: await this.isAutoApproveActivitiesEnabled(),
      achievementsCountSince: await this.getAchievementsCountSince(),
    };
  }

  public static async update(dto: UpdateSettingsDTO, adminId: string) {
    if (dto.autoApproveActivities !== undefined) {
      await this.setBoolean(AUTO_APPROVE_ACTIVITIES_KEY, dto.autoApproveActivities, adminId);
    }
    if (dto.achievementsCountSince !== undefined) {
      await this.setDate(ACHIEVEMENTS_COUNT_SINCE_KEY, dto.achievementsCountSince, adminId);
    }
    return this.get();
  }

  /**
   * Usado internamente por ActivityService/EvidenceService pra decidir se
   * uma atividade recém-registrada (ou que acabou de receber a evidência
   * exigida) deve ser aprovada sozinha, sem esperar um administrador.
   * Padrão ATIVADO quando a configuração nunca foi definida — reflete a
   * decisão de negócio atual (aprovação automática é o comportamento
   * padrão desejado); desligar exige uma ação explícita na tela.
   */
  public static async isAutoApproveActivitiesEnabled(): Promise<boolean> {
    const row = await prisma.systemSetting.findUnique({ where: { key: AUTO_APPROVE_ACTIVITIES_KEY } });
    if (!row) return true;
    return row.value === 'true';
  }

  private static async setBoolean(key: string, value: boolean, adminId: string): Promise<void> {
    const existing = await prisma.systemSetting.findUnique({ where: { key } });

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: String(value), updatedBy: adminId },
      create: { key, value: String(value), updatedBy: adminId },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE_SETTING',
        entity: 'SystemSetting',
        entityId: key,
        oldValues: JSON.stringify({ value: existing?.value ?? null }),
        newValues: JSON.stringify({ value: String(value) }),
      },
    });
  }

  /**
   * Data de corte usada pelo motor de conquistas (achievement.service.ts)
   * pra ignorar atividades "legado" na contagem de progresso dos critérios
   * baseados em atividade (ACTIVITY_COUNT, SPECIFIC_MODALITY,
   * CUMULATIVE_QUANTITY, DISTINCT_MODALITIES, STREAK_DAYS) — a pedido do
   * usuário, pra zerar o progresso de todo mundo num relançamento oficial
   * sem apagar o histórico de atividades em si. `null`/nunca definido =
   * sem corte, conta a vida toda (comportamento original, inalterado).
   * Decisão deliberada: é um corte ÚNICO, fixo — não se move sozinho a
   * cada novo ciclo depois disso (diferente do reset de pontos por ciclo,
   * ver ciclos.md). TOTAL_POINTS (Centena/Clube dos 1.000/Milionário)
   * nunca usa esse corte — continua vitalício de verdade, por decisão
   * explícita do usuário.
   */
  public static async getAchievementsCountSince(): Promise<Date | null> {
    const row = await prisma.systemSetting.findUnique({ where: { key: ACHIEVEMENTS_COUNT_SINCE_KEY } });
    if (!row || !row.value) return null;
    const parsed = new Date(row.value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private static async setDate(key: string, value: Date | null, adminId: string): Promise<void> {
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    const serialized = value ? value.toISOString() : '';

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: serialized, updatedBy: adminId },
      create: { key, value: serialized, updatedBy: adminId },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE_SETTING',
        entity: 'SystemSetting',
        entityId: key,
        oldValues: JSON.stringify({ value: existing?.value ?? null }),
        newValues: JSON.stringify({ value: serialized || null }),
      },
    });
  }
}
