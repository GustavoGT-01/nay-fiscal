import { accessKeyDv } from '../../src/xml/nfe-parser.js';

/** Gera XMLs de NF-e sinteticos (leiaute 4.00 + grupo IBSCBS) para testes e dados de demonstracao. */

export interface BuildItem {
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  qty: number;
  unit: number;
  icms: { table: 'CST' | 'CSOSN'; code: string; aliq?: number };
  pis?: string;
  cofins?: string;
  /** undefined = sem grupo IBSCBS */
  ibscbs?: { cst: string; cClassTrib: string | null; valores?: boolean };
}

export interface BuildNfe {
  uf: string; // codigo IBGE da UF, ex. 41
  issuedAt: Date;
  number: number;
  series?: number;
  natOp: string;
  emitter: { cnpj: string; name: string; city: string; cityCode: string; uf: string; crt: '1' | '2' | '3' };
  recipient: { cnpj: string; name: string; city: string; cityCode: string; uf: string };
  items: BuildItem[];
  cStat?: '100' | '101';
}

const pad = (v: string | number, n: number) => String(v).padStart(n, '0');
const money = (v: number) => v.toFixed(2);

export function buildKey(p: { uf: string; issuedAt: Date; cnpj: string; model: string; series: number; number: number; code: number }) {
  const aamm = pad(p.issuedAt.getFullYear() % 100, 2) + pad(p.issuedAt.getMonth() + 1, 2);
  const k43 = p.uf + aamm + pad(p.cnpj, 14) + p.model + pad(p.series, 3) + pad(p.number, 9) + '1' + pad(p.code, 8);
  return k43 + accessKeyDv(k43);
}

/** Gera um CNPJ valido a partir de uma raiz de 12 digitos. */
export function cnpjFrom(base12: string) {
  const calc = (s: string) => {
    const w = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = s.split('').reduce((a, d, i) => a + Number(d) * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  const d2 = calc(base12 + d1);
  return base12 + d1 + d2;
}

export function buildNfe(p: BuildNfe): { key: string; xml: string } {
  const series = p.series ?? 1;
  const key = buildKey({ uf: p.uf, issuedAt: p.issuedAt, cnpj: p.emitter.cnpj, model: '55', series, number: p.number, code: (p.number * 7919) % 1e8 });
  let vProd = 0, vBC = 0, vICMS = 0, vPIS = 0, vCOF = 0, vIBS = 0, vCBS = 0;
  const dets = p.items.map((it, i) => {
    const v = +(it.qty * it.unit).toFixed(2);
    vProd += v;
    let icms: string;
    if (it.icms.table === 'CSOSN') icms = `<ICMSSN102><orig>0</orig><CSOSN>${it.icms.code}</CSOSN></ICMSSN102>`;
    else {
      const aliq = it.icms.aliq ?? 0;
      const vi = +(v * aliq / 100).toFixed(2);
      if (aliq) { vBC += v; vICMS += vi; }
      icms = aliq
        ? `<ICMS00><orig>0</orig><CST>${it.icms.code}</CST><modBC>3</modBC><vBC>${money(v)}</vBC><pICMS>${aliq.toFixed(2)}</pICMS><vICMS>${money(vi)}</vICMS></ICMS00>`
        : `<ICMS40><orig>0</orig><CST>${it.icms.code}</CST></ICMS40>`;
    }
    const pisCst = it.pis ?? '01';
    const cofCst = it.cofins ?? pisCst;
    const trib = pisCst === '01' && it.icms.table === 'CST';
    const vp = trib ? +(v * 0.0165).toFixed(2) : 0;
    const vc = trib ? +(v * 0.076).toFixed(2) : 0;
    vPIS += vp; vCOF += vc;
    const pis = trib
      ? `<PISAliq><CST>${pisCst}</CST><vBC>${money(v)}</vBC><pPIS>1.65</pPIS><vPIS>${money(vp)}</vPIS></PISAliq>`
      : `<PISOutr><CST>${pisCst}</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr>`;
    const cof = trib
      ? `<COFINSAliq><CST>${cofCst}</CST><vBC>${money(v)}</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>${money(vc)}</vCOFINS></COFINSAliq>`
      : `<COFINSOutr><CST>${cofCst}</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr>`;
    let ibs = '';
    if (it.ibscbs) {
      let g = '';
      if (it.ibscbs.valores) {
        const base = +(v - (trib ? vp + vc : 0)).toFixed(2);
        const vi = +(base * 0.001).toFixed(2);
        const vcb = +(base * 0.009).toFixed(2);
        vIBS += vi; vCBS += vcb;
        g = `<gIBSCBS><vBC>${money(base)}</vBC><gIBSUF><pIBSUF>0.1000</pIBSUF><vIBSUF>${money(vi)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.0000</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${money(vi)}</vIBS><gCBS><pCBS>0.9000</pCBS><vCBS>${money(vcb)}</vCBS></gCBS></gIBSCBS>`;
      }
      ibs = `<IBSCBS><CST>${it.ibscbs.cst}</CST>${it.ibscbs.cClassTrib ? `<cClassTrib>${it.ibscbs.cClassTrib}</cClassTrib>` : ''}${g}</IBSCBS>`;
    }
    return `<det nItem="${i + 1}"><prod><cProd>${it.code}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.description}</xProd><NCM>${it.ncm}</NCM><CFOP>${it.cfop}</CFOP><uCom>UN</uCom><qCom>${it.qty.toFixed(4)}</qCom><vUnCom>${it.unit.toFixed(2)}</vUnCom><vProd>${money(v)}</vProd><indTot>1</indTot></prod><imposto><ICMS>${icms}</ICMS><PIS>${pis}</PIS><COFINS>${cof}</COFINS>${ibs}</imposto></det>`;
  });
  const dh = p.issuedAt.toISOString().slice(0, 19) + '-03:00';
  const idDest = p.emitter.uf === p.recipient.uf ? '1' : '2';
  const ibsTot = p.items.some((i) => i.ibscbs)
    ? `<IBSCBSTot><vBCIBSCBS>0.00</vBCIBSCBS><gIBS><vIBS>${money(vIBS)}</vIBS></gIBS><gCBS><vCBS>${money(vCBS)}</vCBS></gCBS></IBSCBSTot>`
    : '';
  const cStat = p.cStat ?? '100';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><cUF>${p.uf}</cUF><natOp>${p.natOp}</natOp><mod>55</mod><serie>${series}</serie><nNF>${p.number}</nNF><dhEmi>${dh}</dhEmi><tpNF>1</tpNF><idDest>${idDest}</idDest><tpAmb>1</tpAmb><finNFe>1</finNFe></ide><emit><CNPJ>${p.emitter.cnpj}</CNPJ><xNome>${p.emitter.name}</xNome><enderEmit><cMun>${p.emitter.cityCode}</cMun><xMun>${p.emitter.city}</xMun><UF>${p.emitter.uf}</UF></enderEmit><CRT>${p.emitter.crt}</CRT></emit><dest><CNPJ>${p.recipient.cnpj}</CNPJ><xNome>${p.recipient.name}</xNome><enderDest><cMun>${p.recipient.cityCode}</cMun><xMun>${p.recipient.city}</xMun><UF>${p.recipient.uf}</UF></enderDest></dest>${dets.join('')}<total><ICMSTot><vBC>${money(vBC)}</vBC><vICMS>${money(vICMS)}</vICMS><vProd>${money(vProd)}</vProd><vPIS>${money(vPIS)}</vPIS><vCOFINS>${money(vCOF)}</vCOFINS><vNF>${money(vProd)}</vNF></ICMSTot>${ibsTot}</total></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><nProt>1${pad(p.number, 14)}</nProt><cStat>${cStat}</cStat><xMotivo>${cStat === '100' ? 'Autorizado o uso da NF-e' : 'Cancelamento de NF-e homologado'}</xMotivo></infProt></protNFe></nfeProc>`;
  return { key, xml };
}
