import { parseFiscalXml, type ParseResult } from '../../xml/nfe-parser.js';
import * as clients from '../../models/client.js';
import * as documents from '../../models/document.js';
import { auditParsedDocument, auditStoredDocument } from '../audit.js';
import type { RuleSeed } from '../../engine/catalog.js';
import type { ClientContext } from '../../engine/evaluator.js';
import { directionOf, rootsOf } from './direction.js';
import { activeRules } from '../../models/rule.js';
import type { DocumentChange } from '../../models/document-event.js';
import { decide } from './replacement.js';

type IngestOutcome = 'novo' | 'atualizado' | 'cancelamento' | 'ignorado' | 'recusado' | 'mantido';

export interface IngestResult {
  outcome: IngestOutcome;
  status?: string;
  /** mudanca numa nota ja guardada, para o historico (quem fez e registrado por quem chamou) */
  change?: { type: DocumentChange; key: string; number: string };
}

/** Dados ja carregados pelo chamador de um lote, para nao repetir consultas a cada nota. */
export interface IngestShared {
  rules?: RuleSeed[];
  client?: Awaited<ReturnType<typeof clients.findWithEstablishmentsUnscoped>>;
  /** XML ja lido pelo chamador: nao le de novo. */
  parsed?: ParseResult;
}

/**
 * Le um XML, grava (ou atualiza) o documento e audita. Uma nota autorizada nao e sobrescrita por
 * conteudo diferente (ver replacement.ts), e nota cancelada nunca volta a valer por reimportacao.
 */
export async function ingestXml(clientId: string, xml: string, uploadId?: string, shared: IngestShared = {}): Promise<IngestResult> {
  const client = shared.client ?? (await clients.findWithEstablishmentsUnscoped(clientId));
  const root = client.cnpj.slice(0, 8);
  const ctx: ClientContext = { cnpjRoot: root, cityCode: client.cityCode, city: client.city };
  const parsed = shared.parsed ?? parseFiscalXml(xml);

  if (parsed.kind === 'cancelamento') {
    const doc = await documents.findByKeyUnscoped(clientId, parsed.key);
    if (!doc) return { outcome: 'ignorado' };
    await documents.markCancelled(doc.id);
    const status = await auditStoredDocument(doc.id, shared.rules, ctx);
    return { outcome: 'cancelamento', status, change: doc.cancelled ? undefined : { type: 'cancelada', key: doc.key, number: doc.number } };
  }

  const direction = directionOf(parsed, rootsOf(client));
  const data = {
    clientId,
    uploadId: uploadId ?? null,
    model: parsed.model,
    key: parsed.key,
    number: parsed.number,
    series: parsed.series,
    direction,
    issuedAt: parsed.issuedAt,
    natOp: parsed.natOp,
    emitterCnpj: parsed.emitter.cnpj,
    emitterName: parsed.emitter.name,
    emitterCity: parsed.emitter.city,
    emitterCityCode: parsed.emitter.cityCode,
    emitterUf: parsed.emitter.uf,
    emitterCrt: parsed.emitter.crt,
    recipientCnpj: parsed.recipient.cnpj,
    recipientName: parsed.recipient.name,
    recipientCity: parsed.recipient.city,
    recipientCityCode: parsed.recipient.cityCode,
    recipientUf: parsed.recipient.uf,
    emitterStreet: parsed.emitter.street,
    emitterNumber: parsed.emitter.number,
    emitterComplement: parsed.emitter.complement,
    emitterDistrict: parsed.emitter.district,
    emitterCep: parsed.emitter.cep,
    emitterIe: parsed.emitter.ie,
    recipientStreet: parsed.recipient.street,
    recipientNumber: parsed.recipient.number,
    recipientComplement: parsed.recipient.complement,
    recipientDistrict: parsed.recipient.district,
    recipientCep: parsed.recipient.cep,
    recipientIe: parsed.recipient.ie,
    exitAt: parsed.exitAt,
    protocolAt: parsed.protocolAt,
    modFrete: parsed.modFrete,
    additionalInfo: parsed.additionalInfo,
    nfse: parsed.nfse ? JSON.stringify(parsed.nfse) : null,
    vProd: parsed.vProd,
    vFrete: parsed.vFrete,
    vSeg: parsed.vSeg,
    vDesc: parsed.vDesc,
    vOutro: parsed.vOutro,
    vIpi: parsed.vIpi,
    total: parsed.total,
    vBc: parsed.vBc,
    vIcms: parsed.vIcms,
    vPis: parsed.vPis,
    vCofins: parsed.vCofins,
    vIbs: parsed.vIbs,
    vCbs: parsed.vCbs,
    cStat: parsed.cStat,
    protocol: parsed.protocol,
    cancelled: parsed.cStat === '101' || parsed.cStat === '151',
    xml,
  };

  /** Grava respeitando a nota ja guardada: recusa, mantem ou atualiza. */
  const save = async (existing: Awaited<ReturnType<typeof documents.findByKeyUnscoped>>) => {
    const decision = decide(existing, parsed);
    if (existing && decision === 'recusa') {
      return { stop: { outcome: 'recusado', change: { type: 'recusada', key: existing.key, number: existing.number } } satisfies IngestResult };
    }
    if (decision === 'mantem') return { stop: { outcome: 'mantido' } satisfies IngestResult };
    const cancelled = data.cancelled || !!existing?.cancelled;
    const doc = await documents.saveWithItems(existing?.id ?? null, { ...data, cancelled }, parsed.items);
    const type: DocumentChange | null = !existing ? null : decision === 'substitui' ? 'substituida' : cancelled && !existing.cancelled ? 'cancelada' : null;
    return { doc, existed: !!existing, change: type ? { type, key: parsed.key, number: parsed.number } : undefined };
  };

  let saved;
  try {
    saved = await save(await documents.findByKeyUnscoped(clientId, parsed.key));
  } catch (err) {
    // importacao concorrente da mesma chave: a outra gravou primeiro, entao decide de novo sobre a que ficou
    if ((err as { code?: string }).code !== 'P2002') throw err;
    const existing = await documents.findByKeyUnscoped(clientId, parsed.key);
    if (!existing) throw err;
    saved = await save(existing);
  }
  if (saved.stop) return saved.stop;
  const status = await auditParsedDocument(saved.doc, parsed, shared.rules ?? (await activeRules()), ctx);
  return { outcome: saved.existed ? 'atualizado' : 'novo', status, change: saved.change };
}
