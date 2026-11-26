import { describe, expect, it } from 'vitest';
import { centavos, decodeSped, parseSped } from '../src/services/sped/parse.js';
import { c100, h0000 } from './helpers/sped.js';
import { crossCheck, type DocLite } from '../src/services/sped/crosscheck.js';

const CHAVE = (n: number) => String(n).padStart(44, '0');

describe('leitura do SPED', () => {
  it('lê o cabeçalho e as notas de NF-e e NFC-e, com valores em centavos', () => {
    const r = parseSped([h0000('55667788000163'), c100({ key: CHAVE(1), total: '1.234,56'.replace('.', '') }), c100({ key: CHAVE(2), mod: '65', oper: '1' }), '|9999|4|'].join('\r\n'));
    expect(r.header).toMatchObject({ cnpj: '55667788000163', name: 'Empresa Exemplo Ltda', uf: 'PR' });
    expect(r.header.start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ operation: 'entrada', series: '1', number: '10', totalCents: 123456, icmsCents: 1200, line: 2 });
    expect(r.entries[1]).toMatchObject({ operation: 'saida' });
  });

  it('ignora C100 de outro modelo ou com chave inválida, e conta quantos', () => {
    const r = parseSped([h0000('55667788000163'), c100({ key: CHAVE(1), mod: '01' }), c100({ key: '123' }), c100({ key: CHAVE(3) })].join('\n'));
    expect(r.entries).toHaveLength(1);
    expect(r.ignored).toBe(2);
  });

  it('arquivo sem 0000 ou com cabeçalho quebrado dá erro legível', () => {
    expect(() => parseSped('|C100|0|')).toThrow('falta o registro 0000');
    expect(() => parseSped('|0000|017|0|xx|yy|Nome|123||PR|')).toThrow('cabecalho');
  });

  it('centavos e decodificação', () => {
    expect(centavos('10,05')).toBe(1005);
    expect(centavos('')).toBe(0);
    expect(centavos('abc')).toBe(0);
    expect(decodeSped(Buffer.from('Ação', 'utf8'))).toBe('Ação');
    expect(decodeSped(Buffer.from('Ação', 'latin1'))).toBe('Ação'); // ISO-8859-1, como o SPED costuma vir
  });
});

describe('cruzamento SPED x notas importadas', () => {
  const doc = (n: number, o: Partial<DocLite> = {}): DocLite => ({ id: `d${n}`, key: CHAVE(n), number: String(n), totalCents: 10000, icmsCents: 1200, direction: 'entrada', cancelled: false, ...o });
  const entry = (n: number, o: Record<string, unknown> = {}) => parseSped([h0000('55667788000163'), c100({ key: CHAVE(n), ...o })].join('\n')).entries[0]!;
  const check = (entries: ReturnType<typeof entry>[], docs: DocLite[], periodo = docs) =>
    crossCheck(entries, new Map(docs.map((d) => [d.key, d])), periodo).map((d) => d.kind);

  it('tudo igual: nenhuma divergência', () => {
    expect(check([entry(1)], [doc(1)])).toEqual([]);
  });

  it('valor, ICMS e operação diferentes são apontados', () => {
    expect(check([entry(1, { total: '99,00' })], [doc(1)])).toEqual(['valor']);
    expect(check([entry(1, { icms: '10,00' })], [doc(1)])).toEqual(['icms']);
    expect(check([entry(1, { oper: '1' })], [doc(1)])).toEqual(['operacao']);
  });

  it('nota no SPED sem XML importado: aponta, exceto se for cancelada ou inutilizada', () => {
    expect(check([entry(1)], [])).toEqual(['sem_xml']);
    expect(check([entry(1, { sit: '02' })], [])).toEqual([]);
    expect(check([entry(1, { sit: '05' })], [])).toEqual([]);
  });

  it('nota importada que não está no SPED: aponta, exceto se estiver cancelada', () => {
    expect(check([], [doc(1)])).toEqual(['fora_do_sped']);
    expect(check([], [doc(1, { cancelled: true })])).toEqual([]);
  });

  it('situação diferente (cancelada de um lado só) é um achado só, sem comparar valores', () => {
    expect(check([entry(1, { sit: '02', total: '0,00', icms: '0,00' })], [doc(1)])).toEqual(['situacao']);
    expect(check([entry(1)], [doc(1, { cancelled: true })])).toEqual(['situacao']);
    expect(check([entry(1, { sit: '02', total: '0,00' })], [doc(1, { cancelled: true })])).toEqual([]);
  });

  it('nota achada pela chave mas emitida fora do período não vira "fora do SPED"', () => {
    const fora = doc(1);
    expect(crossCheck([entry(1)], new Map([[fora.key, fora]]), [])).toEqual([]);
  });
});
