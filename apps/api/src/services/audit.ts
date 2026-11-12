import { auditDocument, verdictFor, type ClientContext } from '../engine/evaluator.js';
import type { RuleSeed } from '../engine/catalog.js';
import { parseFiscalXml, type ParsedDocument } from '../xml/nfe-parser.js';
import { activeRules } from '../models/rule.js';
import * as clients from '../models/client.js';
import * as documents from '../models/document.js';
import * as findings_ from '../models/finding.js';
import * as auditRuns from '../models/audit.js';

export async function clientContext(clientId: string): Promise<ClientContext> {
  const c = await clients.findById(clientId);
  return { cnpjRoot: c.cnpj.slice(0, 8), cityCode: c.cityCode, city: c.city };
}

/** Audita um documento ja gravado: refaz a leitura do XML, roda as regras e grava os achados. */
export async function auditStoredDocument(docId: string, rules?: RuleSeed[], ctx?: ClientContext) {
  const doc = await documents.findWithItems(docId);
  rules ??= await activeRules();
  ctx ??= await clientContext(doc.clientId);
  const parsed = parseFiscalXml(doc.xml);
  if (parsed.kind !== 'documento') return;
  const { findings, status } = auditDocument(parsed as ParsedDocument, rules, ctx, { cancelled: doc.cancelled });
  const verdict = verdictFor(doc.direction, status, findings, rules);
  const itemByN = new Map(doc.items.map((i) => [i.n, i.id]));
  await findings_.replaceAudit(
    docId,
    findings.map((f) => ({
      documentId: docId,
      itemId: f.itemN ? itemByN.get(f.itemN) ?? null : null,
      ruleCode: f.ruleCode,
      field: f.field,
      kind: f.kind,
      severity: f.severity,
      observed: f.observed,
      expected: f.expected,
    })),
    { status, verdict },
  );
  return status;
}

/** Roda a auditoria de todas as notas do cliente (opcionalmente filtradas por periodo). */
export async function runClientAudit(clientId: string, from?: Date, to?: Date) {
  const docs = await documents.idsForAudit(clientId, from, to);
  const run = await auditRuns.createRun(clientId, docs.length);
  // processa em segundo plano; o front acompanha por GET /api/audit/runs/:id
  void (async () => {
    const rules = await activeRules();
    const ctx = await clientContext(clientId);
    let n = 0;
    for (const d of docs) {
      await auditStoredDocument(d.id, rules, ctx);
      n++;
      if (n % 10 === 0 || n === docs.length) await auditRuns.updateRun(run.id, { processed: n });
    }
    await auditRuns.updateRun(run.id, { status: 'CONCLUIDA', processed: n, finishedAt: new Date() });
  })().catch(async (e) => {
    await auditRuns.updateRun(run.id, { status: 'ERRO' });
    console.error(e);
  });
  return run;
}