import { XMLParser } from 'fast-xml-parser';
import { nfseCancelKey, parseNfse, type NfseData } from './nfse-parser.js';

/** Resultado normalizado da leitura de um XML fiscal. */
export interface ParsedItem {
  n: number;
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  qty: number;
  unitValue: number;
  total: number;
  icmsTable: 'CST' | 'CSOSN' | null;
  cstIcms: string | null;
  vIcms: number;
  cstPis: string | null;
  vPis: number;
  cstCofins: string | null;
  vCofins: number;
  hasIbsCbs: boolean;
  cstIbsCbs: string | null;
  cClassTrib: string | null;
  pIbs: number;
  vIbs: number;
  pCbs: number;
  vCbs: number;
}

/** Endereco e IE de emitente/destinatario (usados no PDF da nota). */
export interface ParsedAddress {
  street: string;
  number: string;
  complement: string;
  district: string;
  cep: string;
  ie: string;
}

export interface ParsedDocument {
  kind: 'documento';
  model: string;
  key: string;
  number: string;
  series: string;
  tpNF: '0' | '1';
  issuedAt: Date;
  exitAt: Date | null;
  natOp: string;
  emitter: { cnpj: string; name: string; city: string; cityCode: string; uf: string; crt: string | null } & ParsedAddress;
  recipient: { cnpj: string; name: string; city: string; cityCode: string; uf: string } & ParsedAddress;
  total: number;
  vProd: number;
  vFrete: number;
  vSeg: number;
  vDesc: number;
  vOutro: number;
  vIpi: number;
  modFrete: string | null;
  additionalInfo: string;
  protocolAt: Date | null;
  vBc: number;
  vIcms: number;
  vPis: number;
  vCofins: number;
  vIbs: number;
  vCbs: number;
  cStat: string | null;
  protocol: string | null;
  items: ParsedItem[];
  /** so na NFS-e (modelo NFSE) */
  nfse?: NfseData;
  xml: string;
}

export interface ParsedCancelEvent {
  kind: 'cancelamento';
  key: string;
}

export type ParseResult = ParsedDocument | ParsedCancelEvent;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false, // manter zeros a esquerda (CST, cClassTrib, CFOP)
  isArray: (name) => name === 'det' || name === 'infQ',
});

const num = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v));
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const opt = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

export const optDate = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d; // data ilegivel vira "sem data", nao Invalid Date no banco
};

/** Data obrigatoria (emissao): sem ela a nota nao entra, e o motivo aparece no envio. */
export function reqDate(v: unknown, campo: string) {
  const d = new Date(String(v ?? ''));
  if (Number.isNaN(d.getTime())) throw new Error(`${campo} ausente ou inválida no XML`);
  return d;
}

/** Endereco (enderEmit/enderDest) + IE. */
function address(ender: any, ie: unknown): ParsedAddress {
  return {
    street: str(ender?.xLgr),
    number: str(ender?.nro),
    complement: str(ender?.xCpl),
    district: str(ender?.xBairro),
    cep: str(ender?.CEP),
    ie: str(ie),
  };
}

/** Grupo IBSCBS (NF-e por item, CT-e por documento): CST, classificacao, aliquotas e valores de IBS e CBS. */
interface IbsCbsXml {
  CST?: unknown;
  cClassTrib?: unknown;
  gIBSCBS?: {
    vIBS?: unknown;
    gIBSUF?: { pIBSUF?: unknown; vIBSUF?: unknown };
    gIBSMun?: { pIBSMun?: unknown; vIBSMun?: unknown };
    gCBS?: { pCBS?: unknown; vCBS?: unknown };
  };
}

function ibsCbsOf(ibs: IbsCbsXml | undefined) {
  const g = ibs?.gIBSCBS;
  return {
    hasIbsCbs: !!ibs,
    cstIbsCbs: opt(ibs?.CST),
    cClassTrib: opt(ibs?.cClassTrib),
    pIbs: num(g?.gIBSUF?.pIBSUF) + num(g?.gIBSMun?.pIBSMun),
    vIbs: num(g?.vIBS) || num(g?.gIBSUF?.vIBSUF) + num(g?.gIBSMun?.vIBSMun),
    pCbs: num(g?.gCBS?.pCBS),
    vCbs: num(g?.gCBS?.vCBS),
  };
}

/** Retorna o primeiro filho (ex.: ICMS00, ICMSSN102) de um grupo de imposto. */
function firstChild(group: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!group || typeof group !== 'object') return undefined;
  const k = Object.keys(group).find((x) => !x.startsWith('@'));
  return k ? (group[k] as Record<string, unknown>) : undefined;
}

/**
 * XML fiscal nunca tem DOCTYPE nem entidades declaradas. Recusar antes de interpretar evita
 * expansao de entidades (billion laughs) e qualquer variacao de XXE.
 */
const MAX_XML_CHARS = 5 * 1024 * 1024;
function assertSafeXml(xml: string) {
  if (xml.length > MAX_XML_CHARS) throw new Error('XML grande demais.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML com DOCTYPE/ENTITY não é aceito.');
}

export function parseFiscalXml(xml: string): ParseResult {
  assertSafeXml(xml);
  const doc = parser.parse(xml);

  // NFS-e nacional e seu evento de cancelamento
  if (doc.NFSe) return parseNfse(doc, xml);
  const nfseKey = nfseCancelKey(doc);
  if (nfseKey) return { kind: 'cancelamento', key: nfseKey };

  // Evento de cancelamento (procEventoNFe / evento tpEvento 110111)
  const evento = doc.procEventoNFe?.evento ?? doc.evento;
  if (evento) {
    const inf = evento.infEvento;
    if (str(inf?.tpEvento) === '110111') return { kind: 'cancelamento', key: str(inf.chNFe) };
    throw new Error(`Evento ${str(inf?.tpEvento)} não suportado`);
  }

  if (doc.cteProc || doc.CTe) return parseCte(doc, xml);

  const nfe = doc.nfeProc?.NFe ?? doc.NFe;
  if (!nfe) throw new Error('Arquivo não é NF-e, NFC-e, CT-e ou NFS-e nacional');
  const inf = nfe.infNFe;
  const prot = doc.nfeProc?.protNFe?.infProt;
  const ide = inf.ide;
  const emit = inf.emit;
  const dest = inf.dest ?? {};
  const tot = inf.total?.ICMSTot ?? {};
  const ibsTot = inf.total?.IBSCBSTot;

  const key = str(inf['@Id']).replace(/^NFe/, '') || str(prot?.chNFe);

  const items: ParsedItem[] = (inf.det ?? []).map((det: any) => {
    const p = det.prod ?? {};
    const imp = det.imposto ?? {};
    const icms = firstChild(imp.ICMS);
    const pis = firstChild(imp.PIS);
    const cofins = firstChild(imp.COFINS);
    const ibs = ibsCbsOf(imp.IBSCBS);
    return {
      n: Number(det['@nItem'] ?? 0),
      code: str(p.cProd),
      description: str(p.xProd),
      ncm: str(p.NCM),
      cfop: str(p.CFOP),
      unit: str(p.uCom),
      qty: num(p.qCom),
      unitValue: num(p.vUnCom),
      total: num(p.vProd),
      icmsTable: icms ? (icms.CSOSN !== undefined ? 'CSOSN' : 'CST') : null,
      cstIcms: icms ? opt(icms.CSOSN ?? icms.CST) : null,
      vIcms: num(icms?.vICMS),
      cstPis: opt(pis?.CST),
      vPis: num(pis?.vPIS),
      cstCofins: opt(cofins?.CST),
      vCofins: num(cofins?.vCOFINS),
      ...ibs,
    };
  });

  return {
    kind: 'documento',
    model: str(ide.mod),
    key,
    number: str(ide.nNF),
    series: str(ide.serie),
    tpNF: str(ide.tpNF) === '0' ? '0' : '1',
    issuedAt: reqDate(str(ide.dhEmi || ide.dEmi), 'Data de emissão (dhEmi)'),
    exitAt: optDate(ide.dhSaiEnt || ide.dSaiEnt),
    natOp: str(ide.natOp),
    emitter: {
      cnpj: str(emit.CNPJ || emit.CPF),
      name: str(emit.xNome),
      city: str(emit.enderEmit?.xMun),
      cityCode: str(emit.enderEmit?.cMun),
      uf: str(emit.enderEmit?.UF),
      crt: opt(emit.CRT),
      ...address(emit.enderEmit, emit.IE),
    },
    recipient: {
      cnpj: str(dest.CNPJ || dest.CPF),
      name: str(dest.xNome),
      city: str(dest.enderDest?.xMun),
      cityCode: str(dest.enderDest?.cMun),
      uf: str(dest.enderDest?.UF),
      ...address(dest.enderDest, dest.IE),
    },
    total: num(tot.vNF),
    vProd: num(tot.vProd),
    vFrete: num(tot.vFrete),
    vSeg: num(tot.vSeg),
    vDesc: num(tot.vDesc),
    vOutro: num(tot.vOutro),
    vIpi: num(tot.vIPI),
    modFrete: opt(inf.transp?.modFrete),
    additionalInfo: str(inf.infAdic?.infCpl),
    protocolAt: optDate(prot?.dhRecbto),
    vBc: num(tot.vBC),
    vIcms: num(tot.vICMS),
    vPis: num(tot.vPIS),
    vCofins: num(tot.vCOFINS),
    vIbs: num(ibsTot?.gIBS?.vIBS),
    vCbs: num(ibsTot?.gCBS?.vCBS),
    cStat: opt(prot?.cStat),
    protocol: opt(prot?.nProt),
    items,
    xml,
  };
}

function parseCte(doc: any, xml: string): ParsedDocument {
  const cte = doc.cteProc?.CTe ?? doc.CTe;
  const inf = cte.infCte;
  const prot = doc.cteProc?.protCTe?.infProt;
  const ide = inf.ide;
  const emit = inf.emit;
  const dest = inf.dest ?? inf.rem ?? {};
  const total = num(inf.vPrest?.vTPrest);
  const icms = firstChild(inf.imp?.ICMS);
  // o CT-e tem um unico servico (vTPrest): o grupo IBSCBS vale para o documento e fica no unico item
  const ibs = ibsCbsOf(inf.imp?.IBSCBS);
  return {
    kind: 'documento',
    model: '57',
    key: str(inf['@Id']).replace(/^CTe/, '') || str(prot?.chCTe),
    number: str(ide.nCT),
    series: str(ide.serie),
    tpNF: '1',
    issuedAt: reqDate(str(ide.dhEmi), 'Data de emissão (dhEmi)'),
    exitAt: null,
    natOp: str(ide.natOp),
    emitter: {
      cnpj: str(emit.CNPJ),
      name: str(emit.xNome),
      city: str(emit.enderEmit?.xMun),
      cityCode: str(emit.enderEmit?.cMun),
      uf: str(emit.enderEmit?.UF),
      crt: opt(emit.CRT),
      ...address(emit.enderEmit, emit.IE),
    },
    recipient: {
      cnpj: str(dest.CNPJ || dest.CPF),
      name: str(dest.xNome),
      city: str((dest.enderDest ?? dest.enderReme)?.xMun),
      cityCode: str((dest.enderDest ?? dest.enderReme)?.cMun),
      uf: str((dest.enderDest ?? dest.enderReme)?.UF),
      ...address(dest.enderDest ?? dest.enderReme, dest.IE),
    },
    total,
    vProd: total,
    vFrete: 0,
    vSeg: 0,
    vDesc: 0,
    vOutro: 0,
    vIpi: 0,
    modFrete: null,
    additionalInfo: str(inf.compl?.xObs),
    protocolAt: optDate(prot?.dhRecbto),
    vBc: num(icms?.vBC),
    vIcms: num(icms?.vICMS),
    vPis: 0,
    vCofins: 0,
    vIbs: ibs.vIbs,
    vCbs: ibs.vCbs,
    cStat: opt(prot?.cStat),
    protocol: opt(prot?.nProt),
    items: [
      {
        n: 1, code: 'FRETE', description: 'Prestação de serviço de transporte', ncm: '', cfop: str(ide.CFOP), unit: 'UN',
        qty: 1, unitValue: total, total, icmsTable: icms ? (icms.CSOSN !== undefined ? 'CSOSN' : 'CST') : null,
        cstIcms: icms ? opt(icms.CSOSN ?? icms.CST) : null, vIcms: num(icms?.vICMS), cstPis: null, vPis: 0,
        cstCofins: null, vCofins: 0, ...ibs,
      },
    ],
    xml,
  };
}

/** Digito verificador da chave de acesso (modulo 11, pesos 2..9 da direita para a esquerda). */
export function accessKeyDv(key43: string): number {
  let sum = 0;
  let w = 2;
  for (let i = key43.length - 1; i >= 0; i--) {
    sum += Number(key43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}
