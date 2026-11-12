import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { NfseDetailDTO, NoteDetailDTO, NoteRowDTO, NoteStatus, Severity, Verdict } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as documents from '../models/document.js';
import { ruleMap } from '../models/rule.js';
import { CCE_EXPLICACAO } from '../engine/actions.js';
import { SEV_ORDER, counterpart, directionWhere, periodWhere, serviceSummary } from '../services/filters.js';
import { loadNote } from '../services/note.js';
import { supplierMessage } from '../services/present.js';

export async function listNotes(req: FastifyRequest) {
  const q = z.object({
    clientId: z.string(), status: z.string().optional(), q: z.string().optional(), page: z.coerce.number().default(0),
    size: z.coerce.number().max(100).default(12), from: z.string().optional(), to: z.string().optional(), supplier: z.string().optional(),
    direction: z.enum(['entrada', 'saida', 'all']).optional(), verdict: z.string().optional(),
    model: z.string().optional(), // NFSE = so notas de servico
  }).parse(req.query);
  const client = await ownClient(req, q.clientId);
  const statusWhere =
    q.status === 'problemas' ? { status: { in: ['erro', 'atencao'] } } : q.status && q.status !== 'all' ? { status: q.status } : {};
  const text = q.q?.trim();
  const where = {
    clientId: client.id, ...statusWhere, ...periodWhere(q), ...directionWhere(q.direction),
    ...(q.verdict ? { verdict: q.verdict } : {}),
    ...(q.model ? { model: q.model } : {}),
    AND: [
      // fornecedor (entrada) ou cliente (saida)
      ...(q.supplier ? [{ OR: [{ emitterCnpj: q.supplier }, { recipientCnpj: q.supplier }] }] : []),
      ...(text ? [{ OR: [{ number: { contains: text } }, { emitterName: { contains: text } }, { recipientName: { contains: text } }, { key: { contains: text } }, { items: { some: { cfop: text } } }] }] : []),
    ],
  };
  const [total, docs, rules] = await Promise.all([documents.count(where), documents.listPage(where, q.page * q.size, q.size), ruleMap()]);
  const rows: NoteRowDTO[] = docs.map((d) => {
    const cp = counterpart(d);
    const uniq = new Map<string, { rule: string; title: string; severity: Severity }>();
    d.findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).forEach((f) => uniq.set(f.ruleCode, { rule: f.ruleCode, title: rules.get(f.ruleCode)?.title ?? f.ruleCode, severity: f.severity as Severity }));
    return {
      id: d.id, number: d.number, series: d.series, model: d.model, key: d.key, direction: d.direction as 'entrada' | 'saida',
      issuedAt: d.issuedAt.toISOString(), counterpart: cp.name, counterpartCnpj: cp.cnpj, cfop: d.items[0]?.cfop ?? '',
      total: d.total, status: d.status as NoteStatus, verdict: d.verdict as Verdict, findings: [...uniq.values()],
      service: serviceSummary(d.nfse),
    };
  });
  return { total, rows };
}

export async function getNote(req: FastifyRequest, reply: FastifyReply): Promise<NoteDetailDTO | void> {
  const { id } = req.params as { id: string };
  const loaded = await loadNote(id, req.me.officeId);
  if (!loaded) return reply.code(404).send({ message: 'Nota não encontrada.' });
  const { doc: d, checks: compact } = loaded;
  const cp = counterpart(d);
  return {
    id: d.id, number: d.number, series: d.series, model: d.model, key: d.key, direction: d.direction as 'entrada' | 'saida',
    issuedAt: d.issuedAt.toISOString(), counterpart: cp.name, counterpartCnpj: cp.cnpj, cfop: d.items[0]?.cfop ?? '',
    total: d.total, status: d.status as NoteStatus, verdict: d.verdict as Verdict,
    findings: compact.filter((c) => c.severity !== 'ok').map((c) => ({ rule: c.ruleCode ?? '', title: c.title, severity: c.severity })),
    emitter: { name: d.emitterName, cnpj: d.emitterCnpj, city: d.emitterCity, uf: d.emitterUf, crt: d.emitterCrt },
    recipient: { name: d.recipientName, cnpj: d.recipientCnpj, city: d.recipientCity, uf: d.recipientUf },
    natureOfOperation: d.natOp, protocol: d.protocol,
    items: d.items.map((i) => ({ n: i.n, code: i.code, description: i.description, ncm: i.ncm, cfop: i.cfop, qty: i.qty, unitValue: i.unitValue, total: i.total, cstIcms: i.cstIcms, vIcms: i.vIcms, cstIbsCbs: i.cstIbsCbs, cClassTrib: i.cClassTrib, vIbs: i.vIbs, vCbs: i.vCbs })),
    taxes: { vBc: d.vBc, vIcms: d.vIcms, vPis: d.vPis, vCofins: d.vCofins, vIbs: d.vIbs, vCbs: d.vCbs },
    checks: compact,
    service: serviceSummary(d.nfse),
    nfse: d.nfse ? (JSON.parse(d.nfse) as NfseDetailDTO) : null,
    supplierMessage: supplierMessage(d, compact, CCE_EXPLICACAO),
    cceNote: compact.some((c) => c.severity === 'erro' && c.action === 'cancelar_reemitir') ? CCE_EXPLICACAO : null,
  };
}