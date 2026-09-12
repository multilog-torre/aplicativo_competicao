import { ActivityType } from '../types/api';

/** Descrição em linguagem simples do critério de uma conquista — usada tanto
 * na tela admin (pré-visualização ao editar) quanto no Catálogo de
 * Conquistas público (documentação viva, sempre derivada do próprio dado,
 * nunca hardcoded). */
export function describeRule(ruleType: string, ruleValue: Record<string, unknown>, activityTypes: ActivityType[]): string {
  const modalityName = (id: unknown) => activityTypes.find((a) => a.id === id)?.name ?? 'modalidade removida';
  switch (ruleType) {
    case 'ACTIVITY_COUNT':
      return `${ruleValue.count ?? '?'} atividades aprovadas`;
    case 'TOTAL_POINTS':
      return `${ruleValue.minPoints ?? '?'} pontos acumulados`;
    case 'STREAK_DAYS':
      return `${ruleValue.days ?? '?'} dias seguidos com atividade`;
    case 'SPECIFIC_MODALITY':
      return `${ruleValue.count ?? 1} atividades de ${modalityName(ruleValue.activityTypeId)}`;
    case 'CUMULATIVE_QUANTITY':
      return `${ruleValue.targetQuantity ?? '?'} de ${modalityName(ruleValue.activityTypeId)} acumulados`;
    case 'DISTINCT_MODALITIES':
      return `atividade em ${ruleValue.count ?? '?'} modalidades diferentes`;
    case 'RANKING_POSITION':
      return `posição ${ruleValue.maxPosition ?? '?'}º ou melhor no ranking geral`;
    case 'ACCOUNT_TENURE_DAYS':
      return `${ruleValue.days ?? '?'} dias desde a criação da conta`;
    default:
      return ruleType;
  }
}
