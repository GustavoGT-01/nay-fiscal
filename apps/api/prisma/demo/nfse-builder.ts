/** Gera XMLs sinteticos de NFS-e no padrao nacional (testes e exemplos). */

export interface BuildNfse {
  number: number;
  issuedAt: Date;
  provider: { cnpj: string; name: string; im?: string; cityCode: string; city: string; uf: string; simples: '1' | '2' | '3' };
  taker: { doc: string; name: string; cityCode: string; city: string; uf: string };
  serviceCode: string; // cTribNac
  description: string;
  value: number;
  /** aliquota de ISS em % */
  rate: number;
  /** sobrescreve o ISS calculado (para simular erro) */
  issOverride?: number;
  tributacao?: '1' | '2' | '3' | '4';
  retention?: '1' | '2' | '3';
  irrf?: number;
  ibscbs?: boolean;
  cStat?: string;
}

const money = (v: number) => v.toFixed(2);
const pad = (v: number | string, n: number) => String(v).padStart(n, '0');

export function buildNfse(p: BuildNfse): { key: string; xml: string } {
  const trib = p.tributacao ?? '1';
  const ret = p.retention ?? '1';
  const iss = p.issOverride ?? (trib === '1' && p.provider.simples !== '2' ? Math.round(p.value * p.rate) / 100 : 0);
  const irrf = p.irrf ?? 0;
  const totRet = (ret === '2' ? iss : 0) + irrf;
  // chave da NFS-e nacional: 50 digitos
  const key = pad(p.provider.cityCode, 7) + '2' + pad(p.provider.cnpj, 14) + pad(p.number, 13) + pad(p.issuedAt.getFullYear() % 100, 2) + pad(p.issuedAt.getMonth() + 1, 2) + pad((p.number * 7919) % 1e9, 9) + '0';
  const dh = p.issuedAt.toISOString().slice(0, 19) + '-03:00';
  const taker = p.taker.doc.length === 11 ? `<CPF>${p.taker.doc}</CPF>` : `<CNPJ>${p.taker.doc}</CNPJ>`;
  const ibs = p.ibscbs
    ? `<IBSCBS><cIndOp>100301</cIndOp><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></IBSCBS>`
    : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infNFSe Id="NFS${key}"><xLocEmi>${p.provider.city}</xLocEmi><xLocPrestacao>${p.provider.city}</xLocPrestacao><nNFSe>${p.number}</nNFSe><cLocIncid>${p.provider.cityCode}</cLocIncid><xLocIncid>${p.provider.city}</xLocIncid><xTribNac>${p.description}</xTribNac><verAplic>1.00</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>${p.cStat ?? '100'}</cStat><dhProc>${dh}</dhProc><nDFSe>${pad(p.number, 9)}</nDFSe><emit><CNPJ>${p.provider.cnpj}</CNPJ><IM>${p.provider.im ?? ''}</IM><xNome>${p.provider.name}</xNome><enderNac><xLgr>Rua das Flores</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>${p.provider.cityCode}</cMun><UF>${p.provider.uf}</UF><CEP>87000000</CEP></enderNac></emit><valores><vBC>${money(p.value)}</vBC><pAliqAplic>${p.rate.toFixed(2)}</pAliqAplic><vISSQN>${money(iss)}</vISSQN><vTotalRet>${money(totRet)}</vTotalRet><vLiq>${money(p.value - totRet)}</vLiq></valores>${ibs}<DPS versao="1.00"><infDPS Id="DPS${key.slice(0, 45)}"><tpAmb>1</tpAmb><dhEmi>${dh}</dhEmi><verAplic>1.00</verAplic><serie>1</serie><nDPS>${p.number}</nDPS><dCompet>${dh.slice(0, 10)}</dCompet><tpEmit>1</tpEmit><cLocEmi>${p.provider.cityCode}</cLocEmi><prest><CNPJ>${p.provider.cnpj}</CNPJ><regTrib><opSimpNac>${p.provider.simples}</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest><toma>${taker}<xNome>${p.taker.name}</xNome><end><endNac><cMun>${p.taker.cityCode}</cMun><CEP>87000000</CEP></endNac><xLgr>Av. Brasil</xLgr><nro>500</nro><xBairro>Zona 1</xBairro></end></toma><serv><locPrest><cLocPrestacao>${p.provider.cityCode}</cLocPrestacao></locPrest><cServ><cTribNac>${p.serviceCode}</cTribNac><xDescServ>${p.description}</xDescServ></cServ></serv><valores><vServPrest><vServ>${money(p.value)}</vServ></vServPrest><trib><tribMun><tribISSQN>${trib}</tribISSQN><tpRetISSQN>${ret}</tpRetISSQN><pAliq>${p.rate.toFixed(2)}</pAliq></tribMun><tribFed>${irrf ? `<vRetIRRF>${money(irrf)}</vRetIRRF>` : ''}</tribFed></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
  return { key, xml };
}
