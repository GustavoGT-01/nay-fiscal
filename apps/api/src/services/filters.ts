import type { NoteRowDTO } from '@nay/shared';
import type { NfseData } from '../xml/nfse-parser.js';

export const SEV_ORDER: Record<string, number> = { erro: 0, atencao: 1, a_verificar: 2, ok: 3 };

/** Resumo de servico para a linha da lista (so NFS-e). */
export function serviceSummary(json: string | null): NoteRowDTO['service'] {
  if (!json) return null;
  const n = JSON.parse(json) as NfseData;
  return { code: n.serviceCode, description: n.description, issRate: n.issRate, issValue: n.issValue, retained: n.issRetention === '2' || n.issRetention === '3', competence: n.competence };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Data AAAA-MM-DD do filtro; qualquer outra coisa e erro 400 (antes virava 500 no banco). */
function day(v: unknown, time: string) {
  if (v === undefined || v === null || v === '') return undefined;
  const d = typeof v === 'string' && ISO_DAY.test(v) ? new Date(`${v}T${time}-03:00`) : null;
  if (!d || Number.isNaN(d.getTime())) throw Object.assign(new Error('Data inválida. Use AAAA-MM-DD.'), { statusCode: 400 });
  return d;
}

export function periodWhere(q: { from?: unknown; to?: unknown }) {
  const gte = day(q.from, '00:00:00');
  const lte = day(q.to, '23:59:59');
  if (!gte && !lte) return {};
  return { issuedAt: { gte, lte } };
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