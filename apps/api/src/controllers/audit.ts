import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RuleGroupDTO, Severity, SupplierGroupDTO } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as documents from '../models/document.js';
import * as findings from '../models/finding.js';
import * as auditRuns from '../models/audit.js';
import { ruleMap } from '../models/rule.js';
import { runClientAudit } from '../services/audit.js';
import { exportRows, toCsv, toXlsx } from '../services/audit-export.js';
import { SEV_ORDER, directionWhere, periodWhere } from '../services/filters.js';

export async function ruleGroups(req: FastifyRequest): Promise<RuleGroupDTO[]> {
  const q = req.query as { clientId?: string; from?: string; to?: string; direction?: string };
  const client = await ownClient(req, q.clientId);
  const list = await findings.listForRuleGroups({ severity: { not: 'ok' }, document: { clientId: client.id, status: { not: 'cancelada' }, ...periodWhere(q), ...directionWhere(q.direction) } });
  const rules = await ruleMap();
  const groups = new Map<string, RuleGroupDTO & { docs: Map<string, string> }>();
  for (const f of list) {
    const r = rules.get(f.ruleCode);
    if (!r) continue;
    let g = groups.get(f.ruleCode);
    if (!g) {
      g = { code: r.code, title: r.title, severity: f.severity as Severity, description: r.description, fixTag: r.fixTag, items: 0, notes: 0, sampleNotes: [], docs: new Map() };
      groups.set(f.ruleCode, g);
    }
    g.items++;
    g.docs.set(f.documentId, f.document.number);
  }
  return [...groups.values()]
    .map(({ docs, ...g }) => ({ ...g, notes: docs.size, sampleNotes: [...docs].slice(0, 8).map(([id, number]) => ({ id, number })), fixTag: g.fixTag?.includes('{esperado}') ? g.fixTag.replace('{esperado}', g.code === 'cfop-cclasstrib-remessa' ? '410999' : '…') : g.fixTag }))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.items - a.items);
}

export async function supplierGroups(req: FastifyRequest): Promise<SupplierGroupDTO[]> {
  const q = req.query as { clientId?: string; from?: string; to?: string; direction?: string };
  const client = await ownClient(req, q.clientId);
  const base = { clientId: client.id, status: { not: 'cancelada' }, ...periodWhere(q) };
  // entradas agrupam por fornecedor (emitente); saidas, por cliente (destinatario)
  const [ent, sai] = await Promise.all([
    q.direction === 'saida' ? [] : documents.groupBySupplier({ ...base, direction: 'entrada' }),
    q.direction === 'saida' || q.direction === 'all' ? documents.groupByCustomer({ ...base, direction: 'saida' }) : [],
  ]);
  const rows = [
    ...ent.map((r) => ({ cnpj: r.emitterCnpj, name: r.emitterName, status: r.status, n: r._count })),
    ...sai.map((r) => ({ cnpj: r.recipientCnpj, name: r.recipientName, status: r.status, n: r._count })),
  ];
  const map = new Map<string, SupplierGroupDTO>();
  for (const r of rows) {
    const g = map.get(r.cnpj) ?? { cnpj: r.cnpj, name: r.name, notes: 0, withError: 0, withAttention: 0 };
    g.notes += r.n;
    if (r.status === 'erro') g.withError += r.n;
    if (r.status === 'atencao') g.withAttention += r.n;
    map.set(r.cnpj, g);
  }
  return [...map.values()].sort((a, b) => b.withError - a.withError || b.notes - a.notes);
}

export async function runAudit(req: FastifyRequest) {
  const b = z.object({ clientId: z.string(), from: z.string().optional(), to: z.string().optional() }).parse(req.body);
  const client = await ownClient(req, b.clientId);
  const w = periodWhere(b) as { issuedAt?: { gte?: Date; lte?: Date } };
  return runClientAudit(client.id, w.issuedAt?.gte, w.issuedAt?.lte);
}

export async function getRun(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  return auditRuns.findRunOfOffice(id, req.me.officeId);
}

export async function exportReport(req: FastifyRequest, reply: FastifyReply) {
  const q = req.query as { clientId?: string; format?: string; from?: string; to?: string; direction?: string };
  const client = await ownClient(req, q.clientId);
  const rules = await ruleMap();
  const list = await findings.listForExport({ severity: { not: 'ok' }, document: { clientId: client.id, ...periodWhere(q), ...directionWhere(q.direction) } });
  const rows = exportRows(list, rules);
  const base = `auditoria-${client.cnpj}`;
  if (q.format === 'csv') {
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${base}.csv"`).send(toCsv(rows));
  }
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${base}.xlsx"`)
    .send(await toXlsx(client, rows));
}
