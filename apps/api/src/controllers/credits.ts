import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CreditRowDTO, CreditsDTO } from '@nay/shared';
import { ScopeQuery } from '../lib/query.js';
import { fromCents } from '../lib/money.js';
import { ownClient } from '../middleware/auth.js';
import * as documents from '../models/document.js';
import { periodWhere } from '../services/filters.js';

const CreditsQuery = ScopeQuery.omit({ direction: true }).extend({ group: z.enum(['forn', 'mes']).default('forn') });

/** No maximo 24 meses (os mais recentes): cada mes e uma consulta agregada no banco. */
const MAX_MONTHS = 24;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type Sum = { _count: number; _sum: { vIbs: bigint | null; vCbs: bigint | null } };
const money = (v: bigint | null) => fromCents(v ?? 0n);

/** Soma linhas de groupBy numa linha da tela, repartindo as notas pelo veredito de entrada. */
function addTo(row: CreditRowDTO, verdict: string, r: Sum) {
  row.notes += r._count;
  row.ibs += money(r._sum.vIbs);
  row.cbs += money(r._sum.vCbs);
  if (verdict === 'pode_creditar') row.pode += r._count;
  else if (verdict === 'credito_em_risco') row.risco += r._count;
  else if (verdict === 'nao_creditar') row.nao += r._count;
}
const blank = (key: string, label: string): CreditRowDTO => ({ key, label, notes: 0, ibs: 0, cbs: 0, pode: 0, risco: 0, nao: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/credits: IBS e CBS destacados nas notas de ENTRADA, repartidos pelo veredito ja calculado
 * (pode creditar, credito em risco, nao creditar). So soma o que esta gravado; nao recalcula imposto.
 */
export async function credits(req: FastifyRequest): Promise<CreditsDTO> {
  const q = CreditsQuery.parse(req.query);
  const client = await ownClient(req, q.clientId);
  const where = { clientId: client.id, direction: 'entrada', ...periodWhere(q) };

  const byVerdict = await documents.creditsByVerdict(where);
  const sum = (v: string) => { const r = byVerdict.find((x) => x.verdict === v); return r ? money(r._sum.vIbs) + money(r._sum.vCbs) : 0; };
  const totals = { pode: round2(sum('pode_creditar')), risco: round2(sum('credito_em_risco')), nao: round2(sum('nao_creditar')) };
  const notAudited = byVerdict.filter((x) => x.verdict === '').reduce((a, x) => a + x._count, 0);

  const rows: CreditRowDTO[] = [];
  if (q.group === 'forn') {
    const map = new Map<string, CreditRowDTO>();
    for (const r of await documents.creditsBySupplier(where)) {
      if (r.verdict === '') continue; // sem auditoria nao ha como dizer se o credito vale
      const row = map.get(r.emitterCnpj) ?? blank(r.emitterCnpj, r.emitterName);
      addTo(row, r.verdict, r);
      map.set(r.emitterCnpj, row);
    }
    rows.push(...map.values());
    rows.sort((a, b) => b.ibs + b.cbs - (a.ibs + a.cbs));
  } else {
    const range = await documents.issuedRange(where);
    const first = range._min.issuedAt;
    const last = range._max.issuedAt;
    if (first && last) {
      // meses do calendario de Brasilia, do mais recente para o mais antigo
      const ym = (d: Date) => { const s = new Date(d.getTime() - 3 * 3600_000); return [s.getUTCFullYear(), s.getUTCMonth()] as const; };
      const [fy, fm] = ym(first);
      let [y, m] = ym(last);
      const meses: { y: number; m: number }[] = [];
      while ((y > fy || (y === fy && m >= fm)) && meses.length < MAX_MONTHS) { meses.push({ y, m }); m--; if (m < 0) { m = 11; y--; } }
      const edge = (yy: number, mm: number) => new Date(`${yy + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}-01T00:00:00-03:00`);
      const lists = await Promise.all(meses.map(({ y: yy, m: mm }) =>
        documents.creditsByVerdict({ AND: [where, { issuedAt: { gte: edge(yy, mm), lt: edge(yy, mm + 1) } }] })));
      meses.forEach(({ y: yy, m: mm }, i) => {
        const row = blank(`${yy}-${String(mm + 1).padStart(2, '0')}`, `${MESES[mm]}/${yy}`);
        for (const r of lists[i]!) if (r.verdict !== '') addTo(row, r.verdict, r);
        if (row.notes) rows.push(row);
      });
    }
  }
  for (const r of rows) { r.ibs = round2(r.ibs); r.cbs = round2(r.cbs); }
  return { totals, notAudited, group: q.group, rows };
}
