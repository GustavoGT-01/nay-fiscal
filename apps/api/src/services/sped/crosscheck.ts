import { SIT_SEM_EFEITO, type SpedEntry } from './parse.js';

/** Nota importada, so com o que o cruzamento compara (valores em centavos). */
export interface DocLite {
  id: string;
  key: string;
  number: string;
  totalCents: number;
  icmsCents: number;
  direction: string;
  cancelled: boolean;
}

export type DivergenceKind = 'sem_xml' | 'fora_do_sped' | 'valor' | 'icms' | 'situacao' | 'operacao';

export interface Divergence {
  kind: DivergenceKind;
  key: string;
  number: string;
  documentId: string | null;
  /** o que o SPED diz e o que o XML diz, em texto, para mostrar lado a lado */
  sped: string;
  xml: string;
}

const brl = (c: number) => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Compara o SPED com as notas importadas (por chave de acesso).
 * `docsNoPeriodo` sao as notas importadas emitidas dentro do periodo do SPED; `docsPorChave` as notas achadas pelas chaves do SPED
 * (inclui as de fora do periodo). Notas canceladas ou sem efeito nao entram nas comparacoes de valor.
 */
export function crossCheck(entries: SpedEntry[], docsPorChave: Map<string, DocLite>, docsNoPeriodo: DocLite[]): Divergence[] {
  const out: Divergence[] = [];
  const noSped = new Set<string>();
  for (const e of entries) {
    noSped.add(e.key);
    const semEfeito = SIT_SEM_EFEITO.has(e.codSit);
    const d = docsPorChave.get(e.key);
    if (!d) {
      // nota cancelada/inutilizada no SPED nao precisa ter XML
      if (!semEfeito) out.push({ kind: 'sem_xml', key: e.key, number: e.number, documentId: null, sped: `${brl(e.totalCents)} (linha ${e.line})`, xml: 'XML não importado' });
      continue;
    }
    const base = { key: e.key, number: e.number || d.number, documentId: d.id };
    if (semEfeito !== d.cancelled) {
      out.push({ ...base, kind: 'situacao', sped: semEfeito ? `sem efeito (situação ${e.codSit})` : 'regular', xml: d.cancelled ? 'cancelada' : 'autorizada' });
      continue;
    }
    if (semEfeito) continue;
    if (e.operation !== d.direction) out.push({ ...base, kind: 'operacao', sped: e.operation, xml: d.direction });
    if (e.totalCents !== d.totalCents) out.push({ ...base, kind: 'valor', sped: brl(e.totalCents), xml: brl(d.totalCents) });
    if (e.icmsCents !== d.icmsCents) out.push({ ...base, kind: 'icms', sped: brl(e.icmsCents), xml: brl(d.icmsCents) });
  }
  for (const d of docsNoPeriodo) {
    if (d.cancelled || noSped.has(d.key)) continue;
    out.push({ kind: 'fora_do_sped', key: d.key, number: d.number, documentId: d.id, sped: 'não escriturada neste arquivo', xml: brl(d.totalCents) });
  }
  return out;
}
