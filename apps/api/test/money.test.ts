import { describe, expect, it } from 'vitest';
import { fromCents, fromDb, toCents, toDb, DOC_MONEY } from '../src/lib/money.js';

describe('dinheiro em centavos', () => {
  it('reais viram centavos inteiros sem erro de float', () => {
    expect(toCents(1234.56)).toBe(123456n);
    expect(toCents(0.1 + 0.2)).toBe(30n);
    expect(toCents(Number.NaN)).toBe(0n);
  });

  it('ida e volta preserva o valor', () => {
    for (const v of [0, 0.01, 99.99, 1234567.89, 4236.1]) expect(fromCents(toCents(v))).toBe(v);
  });

  it('fromDb troca BigInt em qualquer nivel e preserva datas', () => {
    const d = new Date('2026-10-20T10:00:00Z');
    const out = fromDb({ total: 12345n, issuedAt: d, items: [{ total: 100n, qty: 2 }] });
    expect(out).toEqual({ total: 123.45, issuedAt: d, items: [{ total: 1, qty: 2 }] });
  });

  it('toDb converte so os campos de dinheiro listados', () => {
    const out = toDb({ total: 10.5, vIcms: 1.2, qty: 3, number: '1' }, DOC_MONEY);
    expect(out).toEqual({ total: 1050n, vIcms: 120n, qty: 3, number: '1' });
  });

  it('somar centavos nao acumula erro de ponto flutuante', () => {
    const parcelas = Array.from({ length: 10 }, () => toCents(0.1));
    expect(fromCents(parcelas.reduce((a, b) => a + b, 0n))).toBe(1);
    expect(Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0)).not.toBe(1);
  });
});
