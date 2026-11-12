import { parseFiscalXml } from '../../xml/nfe-parser.js';
import * as clients from '../../models/client.js';
import * as documents from '../../models/document.js';
import { auditStoredDocument } from '../audit.js';

type IngestOutcome = 'novo' | 'atualizado' | 'cancelamento' | 'ignorado';

/** Le um XML, grava (ou atualiza) o documento e audita. */
export async function ingestXml(clientId: string, xml: string, uploadId?: string): Promise<{ outcome: IngestOutcome; status?: string }> {
  const client = await clients.findById(clientId);
  const root = client.cnpj.slice(0, 8);
  const parsed = parseFiscalXml(xml);

  if (parsed.kind === 'cancelamento') {
    const doc = await documents.findByKey(clientId, parsed.key);
    if (!doc) return { outcome: 'ignorado' };
    await documents.markCancelled(doc.id);
    const status = await auditStoredDocument(doc.id);
    return { outcome: 'cancelamento', status };
  }

  const direction = parsed.emitter.cnpj.slice(0, 8) === root ? 'saida' : 'entrada';
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

  const existing = await documents.findByKey(clientId, parsed.key);
  const doc = existing
    ? await documents.updateReplacingItems(existing.id, data)
    : await documents.create(data);
  await documents.createItems(parsed.items.map((i) => ({ ...i, documentId: doc.id })));
  const status = await auditStoredDocument(doc.id);
  return { outcome: existing ? 'atualizado' : 'novo', status };
}
