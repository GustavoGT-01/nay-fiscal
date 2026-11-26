/**
 * Protecao minima contra nota forjada: uma nota autorizada (com protocolo) nao e trocada por um XML de
 * conteudo diferente com a mesma chave. A assinatura do XML NAO e conferida; isto so impede sobrescrever
 * o que ja esta guardado. Para trocar de proposito, quem tem permissao apaga a nota e importa de novo.
 */
import { parseFiscalXml, type ParsedDocument } from '../../xml/nfe-parser.js';

/** O que vem de fora do conteudo assinado (protocolo da SEFAZ) e o proprio texto: nao contam como mudanca da nota. */
const FORA = new Set(['xml', 'cStat', 'protocol', 'protocolAt']);
const conteudo = (d: ParsedDocument) => JSON.stringify(d, (k, v: unknown) => (FORA.has(k) ? undefined : v));

/** Os dois XMLs dizem a mesma coisa? Compara o que o leitor extrai dos dois, entao espacos e formatacao nao contam. */
export function sameContent(storedXml: string, incoming: ParsedDocument) {
  if (storedXml === incoming.xml) return true;
  try {
    const old = parseFiscalXml(storedXml);
    return old.kind === 'documento' && conteudo(old) === conteudo(incoming);
  } catch {
    return false; // guardado ilegivel: nao da para afirmar que e a mesma nota
  }
}

/**
 * nova: ainda nao existe · mesma: grava de novo e reaudita · substitui: conteudo mudou numa nota sem protocolo
 * recusa: mudaria uma nota autorizada · mantem: o mesmo conteudo sem o protocolo nao rebaixa a guardada
 */
export type Decision = 'nova' | 'mesma' | 'substitui' | 'recusa' | 'mantem';

export function decide(existing: { xml: string; protocol: string | null } | null, incoming: ParsedDocument): Decision {
  if (!existing) return 'nova';
  const same = sameContent(existing.xml, incoming);
  if (!existing.protocol) return same ? 'mesma' : 'substitui';
  if (!same) return 'recusa';
  if (!incoming.protocol) return 'mantem';
  return incoming.protocol === existing.protocol ? 'mesma' : 'recusa';
}
