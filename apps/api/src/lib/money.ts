/**
 * Dinheiro no banco fica em centavos inteiros (BigInt). O resto da API, o PDF e a web
 * continuam em reais (number); a conversao acontece so na camada models/.
 */

/** Reais (ate 2 casas) para centavos inteiros. Math.round absorve o erro binario do float. */
export const toCents = (reais: number): bigint => BigInt(Math.round((Number.isFinite(reais) ? reais : 0) * 100));

/** Centavos para reais. */
export const fromCents = (cents: bigint): number => Number(cents) / 100;

/** Troca todo BigInt (em qualquer nivel) por reais; datas e outros valores passam intactos. */
export type Reais<T> = T extends bigint ? number
  : T extends Date ? T
  : T extends (infer U)[] ? Reais<U>[]
  : T extends object ? { [K in keyof T]: Reais<T[K]> }
  : T;

export function fromDb<T>(value: T): Reais<T> {
  if (typeof value === 'bigint') return fromCents(value) as Reais<T>;
  if (Array.isArray(value)) return value.map((v) => fromDb(v)) as Reais<T>;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromDb(v);
    return out as Reais<T>;
  }
  return value as Reais<T>;
}

/** Campos em centavos no banco. `unitValue`, `qty` e aliquotas seguem em Float (tem mais casas). */
export const DOC_MONEY = ['vProd', 'vFrete', 'vSeg', 'vDesc', 'vOutro', 'vIpi', 'total', 'vBc', 'vIcms', 'vPis', 'vCofins', 'vIbs', 'vCbs'] as const;
export const ITEM_MONEY = ['total', 'vIcms', 'vPis', 'vCofins', 'vIbs', 'vCbs'] as const;

/** Copia o objeto trocando os campos listados de reais para centavos. */
export function toDb(obj: object, fields: readonly string[]): Record<string, unknown> {
  const out = { ...obj } as Record<string, unknown>;
  for (const f of fields) if (typeof out[f] === 'number') out[f] = toCents(out[f] as number);
  return out;
}
