import type { NoteRowDTO } from '@nay/shared';
import type { NfseData } from '../xml/nfse-parser.js';

export const SEV_ORDER: Record<string, number> = { erro: 0, atencao: 1, a_verificar: 2, ok: 3 };

/** Resumo de servico para a linha da lista (so NFS-e). */
export function serviceSummary(json: string | null): NoteRowDTO['service'] {
  if (!json) return null;
  const n = JSON.parse(json) as NfseData;
  return { code: n.serviceCode, description: n.description, issRate: n.issRate, issValue: n.issValue, retained: n.issRetention === '2' || n.issRetention === '3', competence: n.competence };
}

export function periodWhere(q: { from?: string; to?: string }) {
  if (!q.from && !q.to) return {};
  return { issuedAt: { gte: q.from ? new Date(q.from + 'T00:00:00-03:00') : undefined, lte: q.to ? new Date(q.to + 'T23:59:59-03:00') : undefined } };
}

/** Filtro de direcao: entrada | saida | all (padrao). */
export function directionWhere(direction?: string) {
  return direction === 'entrada' || direction === 'saida' ? { direction } : {};
}

/** Rotulo da acao por achado: na entrada quem corrige e o fornecedor. */
export const actionLabel = (direction: string, action: string, severity: string) =>
  severity !== 'erro' ? 'Conferir' : direction === 'entrada' ? 'Pedir correção ao fornecedor' : action === 'cancelar_reemitir' ? 'Cancelar e reemitir' : 'Conferir';

export const counterpart = (d: { direction: string; emitterName: string; emitterCnpj: string; recipientName: string; recipientCnpj: string }) =>
  d.direction === 'entrada' ? { name: d.emitterName, cnpj: d.emitterCnpj } : { name: d.recipientName, cnpj: d.recipientCnpj };