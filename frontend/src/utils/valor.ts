/**
 * Aceita as duas formas que a operadora pode digitar: "12.345,67" (padrão
 * brasileiro) e "12345.67". Devolve undefined quando não há número, porque os
 * DTOs tratam o campo como opcional — mandar NaN faria o backend recusar.
 */
export function parseValor(input: string): number | undefined {
  const limpo = input.replace(/[R$\s]/g, '').trim();
  if (!limpo) return undefined;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const num = Number(normalizado);
  return Number.isFinite(num) ? num : undefined;
}

/** Valor do banco (Decimal chega como string) para o texto do input. */
export function valorParaInput(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO do banco para o `value` de um <input type="date"> (yyyy-MM-dd). */
export function dataParaInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
