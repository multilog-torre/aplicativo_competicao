/** Tenta desserializar uma string JSON; retorna o valor bruto se não for um JSON válido. */
export function tryParseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
