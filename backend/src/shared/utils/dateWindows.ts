/**
 * Utilitários compartilhados de bucketização de data usados pelos gráficos
 * de série temporal (Painel Geral e Dashboard pessoal) — dia/mês/ano com
 * fuso de Brasília fixo e janelas padrão ou filtradas por período explícito.
 *
 * Extraído do admin-dashboard.service.ts na Fase 22 (filtros + novos
 * gráficos) quando o Dashboard pessoal passou a precisar da mesma lógica
 * pro seu próprio gráfico de evolução histórica — evita duplicar a
 * matemática de fuso horário em dois módulos.
 */

// Sem horário de verão no Brasil desde 2019 — um offset fixo é suficiente e
// evita depender do fuso horário configurado no servidor (em produção,
// tipicamente UTC), que faria os "dias" do gráfico não bater com o dia
// corrido de quem está olhando o painel do Brasil.
export const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;

export const MONTH_LABELS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Tetos de segurança — um filtro de data muito amplo não pode gerar um
// array absurdamente grande na resposta.
export const MAX_DAY_BUCKETS = 366;
export const MAX_MONTH_BUCKETS = 36;
export const MAX_YEAR_BUCKETS = 15;

/** Instante cujo valor UTC representa a hora "de Brasília" — usar sempre com
 * os getters/setters *UTC* (getUTCDate, setUTCMonth, etc.) daqui em diante,
 * nunca os locais (que dependeriam do fuso do servidor). */
export function toBrazilShifted(date: Date): Date {
  return new Date(date.getTime() + BRAZIL_OFFSET_MS);
}

export function brazilDayKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 10);
}

export function brazilMonthKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 7);
}

export function brazilYearKey(date: Date): string {
  return toBrazilShifted(date).toISOString().slice(0, 4);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface DateWindowFilter {
  dateFrom?: Date;
  dateTo?: Date;
}

/** Intervalo de datas pra usar direto num `where` do Prisma. Sem filtro de
 * data explícito, cai no `defaultFrom` (janela ampla o bastante pra cobrir
 * a maior janela padrão exibida). */
export function buildQueryDateRange(filters: DateWindowFilter, defaultFrom: Date): { gte: Date; lte?: Date } {
  const range: { gte: Date; lte?: Date } = { gte: filters.dateFrom ?? defaultFrom };
  if (filters.dateTo) range.lte = filters.dateTo;
  return range;
}

/**
 * Quantos "baldes" (dias/meses/anos) gerar terminando em `toShifted`. Sem
 * filtro de data, usa o padrão da granularidade (ex.: 30 dias/12 meses).
 * Com filtro, cobre exatamente o intervalo escolhido pela pessoa, limitado
 * pelo teto de segurança da granularidade.
 */
export function resolveBucketCount(
  filters: DateWindowFilter,
  toShifted: Date,
  unit: 'day' | 'month' | 'year',
  defaultCount: number,
  maxCount: number,
): number {
  if (!filters.dateFrom && !filters.dateTo) return defaultCount;

  const fromShifted = filters.dateFrom
    ? toBrazilShifted(filters.dateFrom)
    : new Date(toShifted.getTime() - (defaultCount - 1) * 24 * 60 * 60 * 1000);

  let diff: number;
  if (unit === 'day') {
    diff = Math.floor((toShifted.getTime() - fromShifted.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  } else if (unit === 'month') {
    diff = (toShifted.getUTCFullYear() - fromShifted.getUTCFullYear()) * 12 + (toShifted.getUTCMonth() - fromShifted.getUTCMonth()) + 1;
  } else {
    diff = toShifted.getUTCFullYear() - fromShifted.getUTCFullYear() + 1;
  }
  return clamp(diff, 1, maxCount);
}

function padNum(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayKeyAndLabelAt(toShifted: Date, i: number): { date: string; label: string } {
  const d = new Date(toShifted);
  d.setUTCDate(d.getUTCDate() - i);
  return { date: d.toISOString().slice(0, 10), label: `${padNum(d.getUTCDate())}/${padNum(d.getUTCMonth() + 1)}` };
}

export function monthKeyAndLabelAt(toShifted: Date, i: number): { date: string; label: string } {
  const d = new Date(toShifted);
  d.setUTCMonth(d.getUTCMonth() - i, 1); // dia 1 evita estouro (ex.: 31/mar - 1 mês)
  return { date: d.toISOString().slice(0, 7), label: `${MONTH_LABELS_SHORT[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` };
}

export function yearKeyAndLabelAt(toShifted: Date, i: number): { date: string; label: string } {
  const d = new Date(toShifted);
  d.setUTCFullYear(d.getUTCFullYear() - i);
  const key = String(d.getUTCFullYear());
  return { date: key, label: key };
}
