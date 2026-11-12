import type { FastifyRequest } from 'fastify';
import type { ClientDTO, DashboardDTO, EntradaVerdict, NoteStatus, SaidaVerdict } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as clients from '../models/client.js';
import * as documents from '../models/document.js';
import * as findings from '../models/finding.js';
import { ruleMap } from '../models/rule.js';
import { SEV_ORDER, counterpart, directionWhere } from '../services/filters.js';

export async function listClients(req: FastifyRequest): Promise<ClientDTO[]> {
  const list = await clients.listWithEstablishments(req.me.officeId);
  const counts = await documents.countByClientAndStatus(list.map((c) => c.id));
  return list.map((c) => {
    const rows = counts.filter((x) => x.clientId === c.id);
    const total = rows.reduce((a, r) => a + r._count, 0);
    const valid = rows.filter((r) => r.status !== 'cancelada').reduce((a, r) => a + r._count, 0);
    const ok = rows.filter((r) => r.status === 'ok' || r.status === 'atencao').reduce((a, r) => a + r._count, 0);
    return {
      id: c.id, name: c.name, tradeName: c.tradeName, cnpj: c.cnpj, regime: c.regime, city: c.city, uf: c.uf,
      cityCode: c.cityCode, cnae: c.cnae,
      totalNotes: total, conformity: valid ? Math.round((ok / valid) * 100) : null,
      establishments: c.establishments.map((e) => ({ id: e.id, label: e.label, cnpj: e.cnpj })),
    };
  });
}

export async function dashboard(req: FastifyRequest): Promise<DashboardDTO> {
  const { clientId, direction } = req.query as { clientId?: string; direction?: string };
  const client = await ownClient(req, clientId);
  const dir = directionWhere(direction);
  const docs = await documents.listForDashboard(client.id, dir);
  const rules = await ruleMap();
  const totals = { audited: docs.length, ok: 0, erro: 0, atencao: 0, cancelada: 0 };
  for (const d of docs) if (d.status in totals) (totals as any)[d.status]++;
  const itemsByRule = await findings.errorItemsByRule({ document: { clientId: client.id, ...dir, status: { not: 'cancelada' } }, severity: 'erro' });
  const maxV = Math.max(...docs.map((d) => d.total), 1);
  // vereditos sempre das duas direcoes: os paineis de entrada e saida aparecem lado a lado
  const byVerdict = await documents.countByDirectionAndVerdict(client.id);
  const vCount = (direction: string, verdict: string) => byVerdict.find((x) => x.direction === direction && x.verdict === verdict)?._count ?? 0;
  const verdicts: DashboardDTO['verdicts'] = {
    entradas: Object.fromEntries((['pode_creditar', 'credito_em_risco', 'nao_creditar'] as EntradaVerdict[]).map((v) => [v, vCount('entrada', v)])) as Record<EntradaVerdict, number>,
    saidas: Object.fromEntries((['correta', 'corrigir', 'cancelar_reemitir', 'cancelada'] as SaidaVerdict[]).map((v) => [v, vCount('saida', v)])) as Record<SaidaVerdict, number>,
  };
  return {
    client: { id: client.id, name: client.name },
    totals,
    barcode: docs.map((d) => {
      const top = [...d.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])[0];
      return {
        id: d.id, number: d.number, status: d.status as NoteStatus, total: d.total, counterpart: counterpart(d).name,
        topFinding: top ? rules.get(top.ruleCode)?.title ?? null : null,
        weight: d.total > maxV * 0.5 ? 3 : d.total > maxV * 0.15 ? 2 : 1,
      };
    }),
    topErrors: itemsByRule.slice(0, 4).map((r) => ({ code: r.ruleCode, title: rules.get(r.ruleCode)?.title ?? r.ruleCode, items: r._count })),
    lastAuditAt: docs.reduce<Date | null>((a, d) => (d.auditedAt && (!a || d.auditedAt > a) ? d.auditedAt : a), null)?.toISOString() ?? null,
    verdicts,
  };
}