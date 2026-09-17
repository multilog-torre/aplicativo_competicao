import { prisma } from '../../config/database';
import { UpdateSettingsDTO } from './settings.dto';

/** Chave conhecida da tabela genérica `system_settings`. */
const AUTO_APPROVE_ACTIVITIES_KEY = 'AUTO_APPROVE_ACTIVITIES';

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
    };
  }

  public static async update(dto: UpdateSettingsDTO, adminId: string) {
    if (dto.autoApproveActivities !== undefined) {
      await this.setBoolean(AUTO_APPROVE_ACTIVITIES_KEY, dto.autoApproveActivities, adminId);
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
}
