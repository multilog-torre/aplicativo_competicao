/**
 * Data de hoje no fuso LOCAL do navegador, como "YYYY-MM-DD" — para usar em
 * `value`/`max` de `<input type="date">`.
 *
 * NUNCA usar `new Date().toISOString().slice(0, 10)` para isso:
 * `toISOString()` converte para UTC antes de cortar a data, então à noite
 * no Brasil (UTC-3) o resultado já pode ser o dia seguinte em UTC.
 */
export function todayLocalISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
