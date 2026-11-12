/**
 * Leitura da NFS-e do padrao nacional (Sistema Nacional NFS-e, leiaute 1.00):
 * <NFSe><infNFSe> ... dados gerados pela Sefin ... <DPS><infDPS> ... declaracao do prestador.
 * As tags sao procuradas por nome dentro de cada grupo, para tolerar pequenas variacoes de leiaute.
 */
import type { ParsedDocument } from './nfe-parser.js';

/** Dados proprios da NFS-e, guardados em Document.nfse (JSON). */
export interface NfseData {
  /** codigo de tributacao nacional (6 digitos, item da lista da LC 116) */
  serviceCode: string;
  serviceMunicipalCode: string;
  nbs: string;
  description: string;
  competence: string | null;
  /** 1 tributavel, 2 imunidade, 3 exportacao, 4 nao incidencia */
  issTributacao: string;
  /** 1 nao retido, 2 retido pelo tomador, 3 retido pelo intermediario */
  issRetention: string;
  issBase: number;
  issRate: number;
  issValue: number;
  serviceValue: number;
  discounts: number;
  retentionsTotal: number;
  netValue: number;
  /** municipio (IBGE) onde o ISS e devido e onde o servico foi prestado */
  incidenceCityCode: string;
  incidenceCity: string;
  serviceCityCode: string;
  /** 1 nao optante, 2 MEI, 3 ME/EPP */
  simplesOption: string;
  providerIm: string;
  /** retencoes federais */
  retPis: number;
  retCofins: number;
  retIrrf: number;
  retCsll: number;
  retCp: number;
  hasIbsCbs: boolean;
}

type Obj = Record<string, any>;

/** Procura a primeira ocorrencia de uma tag em qualquer nivel do objeto. */
function find(o: unknown, name: string): any {
  if (!o || typeof o !== 'object') return undefined;
  const rec = o as Obj;
  if (name in rec) return rec[name];
  for (const k of Object.keys(rec)) {
    if (k.startsWith('@')) continue;
    const r = find(rec[k], name);
    if (r !== undefined) return r;
  }
  return undefined;
}

const num = (v: unknown) => (v === undefined || v === null || v === '' || typeof v === 'object' ? 0 : Number(v));
const str = (v: unknown) => (v === undefined || v === null || typeof v === 'object' ? '' : String(v));
const opt = (v: unknown) => (str(v) === '' ? null : str(v));

function party(p: Obj | undefined, fallbackCity = '') {
  const end = p?.end ?? p?.enderNac ?? {};
  const nac = end.endNac ?? end;
  return {
    cnpj: str(p?.CNPJ || p?.CPF || p?.NIF),
    name: str(p?.xNome),
    city: str(find(end, 'xMun')) || fallbackCity,
    cityCode: str(nac?.cMun ?? find(end, 'cMun')),
    uf: str(find(end, 'UF')),
    street: str(find(end, 'xLgr')),
    number: str(find(end, 'nro')),
    complement: str(find(end, 'xCpl')),
    district: str(find(end, 'xBairro')),
    cep: str(nac?.CEP ?? find(end, 'CEP')),
    ie: '',
    im: str(p?.IM),
  };
}

export function parseNfse(doc: Obj, xml: string): ParsedDocument {
  const nfse = doc.NFSe;
  const inf: Obj = nfse.infNFSe ?? {};
  const dps: Obj = find(inf, 'infDPS') ?? {};
  const serv: Obj = dps.serv ?? {};
  const vDps: Obj = dps.valores ?? {};
  const vNfse: Obj = inf.valores ?? {};
  const tribMun: Obj = find(vDps, 'tribMun') ?? {};
  const tribFed: Obj = find(vDps, 'tribFed') ?? {};
  const regTrib: Obj = find(dps.prest, 'regTrib') ?? {};

  // prestador: dados completos no grupo emit da NFS-e; documento do prest na DPS
  const emit = party({ ...(dps.prest ?? {}), ...(inf.emit ?? {}) }, str(inf.xLocEmi));
  const toma = party(dps.toma);

  const serviceValue = num(find(vDps, 'vServ'));
  const discounts = num(find(vDps, 'vDescIncond')) + num(find(vDps, 'vDescCond'));
  const issBase = num(vNfse.vBC) || serviceValue - num(find(vDps, 'vDescIncond'));
  const issRate = num(vNfse.pAliqAplic) || num(tribMun.pAliq);
  const issValue = num(vNfse.vISSQN);
  const retPis = num(find(tribFed, 'vPis')) && str(find(tribFed, 'tpRetPisCofins')) === '1' ? num(find(tribFed, 'vPis')) : 0;
  const retCofins = num(find(tribFed, 'vCofins')) && str(find(tribFed, 'tpRetPisCofins')) === '1' ? num(find(tribFed, 'vCofins')) : 0;
  const retIrrf = num(tribFed.vRetIRRF);
  const retCsll = num(tribFed.vRetCSLL);
  const retCp = num(tribFed.vRetCP);
  const retentionsTotal = num(vNfse.vTotalRet) || retPis + retCofins + retIrrf + retCsll + retCp + (str(tribMun.tpRetISSQN) === '2' ? issValue : 0);
  const ibs = find(inf, 'IBSCBS') ?? find(dps, 'IBSCBS');

  const data: NfseData = {
    serviceCode: str(find(serv, 'cTribNac')),
    serviceMunicipalCode: str(find(serv, 'cTribMun')),
    nbs: str(find(serv, 'cNBS')),
    description: str(find(serv, 'xDescServ')),
    competence: opt(dps.dCompet),
    issTributacao: str(tribMun.tribISSQN),
    issRetention: str(tribMun.tpRetISSQN),
    issBase,
    issRate,
    issValue,
    serviceValue,
    discounts,
    retentionsTotal,
    netValue: num(vNfse.vLiq) || serviceValue - discounts - retentionsTotal,
    incidenceCityCode: str(inf.cLocIncid),
    incidenceCity: str(inf.xLocIncid),
    serviceCityCode: str(find(serv, 'cLocPrestacao')),
    simplesOption: str(regTrib.opSimpNac),
    providerIm: emit.im,
    retPis, retCofins, retIrrf, retCsll, retCp,
    hasIbsCbs: !!ibs,
  };

  const key = str(inf['@Id']).replace(/^NFS/, '');
  const vIbs = num(find(ibs, 'vIBSTot')) || num(find(ibs, 'vIBS'));
  const vCbs = num(find(ibs, 'vCBS'));
  return {
    kind: 'documento',
    model: 'NFSE',
    key,
    number: str(inf.nNFSe),
    series: str(dps.serie),
    tpNF: '1',
    issuedAt: new Date(str(dps.dhEmi) || str(inf.dhProc)),
    exitAt: null,
    natOp: str(inf.xTribNac) || 'Prestação de serviço',
    emitter: { ...emit, crt: data.simplesOption === '3' || data.simplesOption === '2' ? '1' : data.simplesOption === '1' ? '3' : null },
    recipient: toma,
    total: serviceValue,
    vProd: serviceValue,
    vFrete: 0, vSeg: 0, vDesc: discounts, vOutro: 0, vIpi: 0,
    modFrete: null,
    additionalInfo: str(find(dps, 'xInfComp')),
    protocolAt: inf.dhProc ? new Date(str(inf.dhProc)) : null,
    vBc: issBase,
    vIcms: 0,
    vPis: retPis,
    vCofins: retCofins,
    vIbs,
    vCbs,
    cStat: opt(inf.cStat),
    protocol: opt(inf.nDFSe),
    items: [{
      n: 1, code: data.serviceCode, description: data.description || str(inf.xTribNac), ncm: '', cfop: '', unit: 'UN', qty: 1,
      unitValue: serviceValue, total: serviceValue, icmsTable: null, cstIcms: null, vIcms: 0, cstPis: null, vPis: 0, cstCofins: null, vCofins: 0,
      hasIbsCbs: !!ibs, cstIbsCbs: opt(find(ibs, 'CST')), cClassTrib: opt(find(ibs, 'cClassTrib')), pIbs: 0, vIbs, pCbs: 0, vCbs,
    }],
    nfse: data,
    xml,
  };
}

/** Evento de cancelamento da NFS-e nacional (e101101). Retorna a chave ou null. */
export function nfseCancelKey(doc: Obj): string | null {
  const ev = doc.evento ?? doc.procEventoNFSe?.evento;
  const ped = find(ev, 'infPedReg');
  if (!ped) return null;
  if (find(ped, 'e101101') === undefined && find(ped, 'e105102') === undefined) return null;
  return str(ped.chNFSe) || null;
}
