import { auditDocument, verdictFor, type ClientContext } from '../engine/evaluator.js';
import type { RuleSeed } from '../engine/catalog.js';
import { parseFiscalXml, type ParsedDocument } from '../xml/nfe-parser.js';
import { activeRules } from '../models/rule.js';
import * as clients from '../models/client.js';
import * as documents from '../models/document.js';
import * as findings_ from '../models/finding.js';
import * as auditRuns from '../models/audit.js';

export async function clientContext(clientId: string): Promise<ClientContext> {
  const c = await clients.findByIdUnscoped(clientId);
  return { cnpjRoot: c.cnpj.slice(0, 8), cityCode: c.cityCode, city: c.city };
}

/** Audita um documento ja gravado: refaz a leitura do XML, roda as regras e grava os achados. */
export async function auditStoredDocument(docId: string, rules?: RuleSeed[], ctx?: ClientContext) {
  const doc = await documents.findWithItemsUnscoped(docId);
  rules ??= await activeRules();
  ctx ??= await clientContext(doc.clientId);
  const parsed = parseFiscalXml(doc.xml);
  if (parsed.kind !== 'documento') return;
  return auditAndStore(docId, parsed as ParsedDocument, doc.direction, doc.cancelled, new Map(doc.items.map((i) => [i.n, i.id])), rules, ctx);
}

/**
 * Audita uma nota recem-gravada cujo XML ja foi lido: nao busca a nota (com o XML) de volta nem le o XML de novo,
 * so os ids dos itens para ligar os achados. E o caminho da importacao.
 */
export async function auditParsedDocument(doc: { id: string; direction: string; cancelled: boolean }, parsed: ParsedDocument, rules: RuleSeed[], ctx: ClientContext) {
  const items = await documents.itemIds(doc.id);
  return auditAndStore(doc.id, parsed, doc.direction, doc.cancelled, new Map(items.map((i) => [i.n, i.id])), rules, ctx);
}

async function auditAndStore(docId: string, parsed: ParsedDocument, direction: string, cancelled: boolean, itemByN: Map<number, string>, rules: RuleSeed[], ctx: ClientContext) {
  const { findings, status } = auditDocument(parsed, rules, ctx, { cancelled });
  const verdict = verdictFor(direction, status, findings, rules);
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
const starting = new Set<string>(); // clientes cuja auditoria esta sendo criada neste instante

const jaRodando = () => Object.assign(new Error('Já existe uma auditoria rodando para este cliente. Aguarde terminar.'), { statusCode: 409 });

export async function runClientAudit(clientId: string, from?: Date, to?: Date) {
  // Checar no banco e criar a rodada sao dois passos com `await` no meio: duas chamadas simultaneas
  // passariam as duas pela checagem. O Set e consultado e preenchido sem `await`, entao uma so entra.
  if (starting.has(clientId)) throw jaRodando();
  starting.add(clientId);
  let docs: Awaited<ReturnType<typeof documents.idsForAudit>>;
  let run: Awaited<ReturnType<typeof auditRuns.createRun>>;
  try {
    if (await auditRuns.findRunning(clientId)) throw jaRodando();
    docs = await documents.idsForAudit(clientId, from, to);
    run = await auditRuns.createRun(clientId, docs.length);
  } finally {
    starting.delete(clientId);
  }
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