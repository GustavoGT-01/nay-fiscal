import type { ParsedDocument } from '../../xml/nfe-parser.js';

export type Direction = 'entrada' | 'saida';

/** Raizes de CNPJ do cliente: a do cadastro e a de cada estabelecimento (pode haver mais de uma raiz num mesmo cliente). */
export const rootsOf = (c: { cnpj: string; establishments?: { cnpj: string }[] }) =>
  new Set([c.cnpj, ...(c.establishments ?? []).map((e) => e.cnpj)].filter((x) => x.length === 14).map((x) => x.slice(0, 8)));

/** So CNPJ (14 digitos) tem raiz: os 8 primeiros digitos de um CPF nao identificam empresa nenhuma. */
const sameCompany = (cnpj: string, roots: ReadonlySet<string>) => cnpj.length === 14 && roots.has(cnpj.slice(0, 8));

/**
 * Direcao da nota para o cliente (raizes do CNPJ do cadastro e dos estabelecimentos):
 * - emitida pelo cliente: saida, salvo emissao propria de entrada (tpNF 0: compra de produtor rural, devolucao, importacao);
 * - emitente CPF ou de outra empresa: entrada (o cliente e o destinatario ou o tomador).
 */
export function directionOf(doc: Pick<ParsedDocument, 'emitter' | 'tpNF'>, roots: ReadonlySet<string>): Direction {
  if (!sameCompany(doc.emitter.cnpj, roots)) return 'entrada';
  return doc.tpNF === '0' ? 'entrada' : 'saida';
}
