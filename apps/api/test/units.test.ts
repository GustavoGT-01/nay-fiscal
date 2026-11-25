import { describe, expect, it } from 'vitest';
import { auditDocument } from '../src/engine/evaluator.js';
import { RULES } from '../src/engine/catalog.js';
import { parseFiscalXml, type ParsedDocument } from '../src/xml/nfe-parser.js';
import { presentFinding, supplierMessage } from '../src/services/present.js';

const CNPJ_TRANSP = '11222333000181';
const CNPJ_CLI = '22333444000190';
const CHAVE = '41261011222333000181570010000001231000001234';

const cte = (extra = '') => `<?xml version="1.0"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe${CHAVE}" versao="4.00">
<ide><cUF>41</cUF><CFOP>6353</CFOP><natOp>Prestação de serviço de transporte</natOp><mod>57</mod><serie>1</serie><nCT>123</nCT><dhEmi>2026-10-20T10:00:00-03:00</dhEmi></ide>
<compl><xObs>Observação do frete</xObs></compl>
<emit><CNPJ>${CNPJ_TRANSP}</CNPJ><IE>123</IE><xNome>Transportadora Alfa</xNome><enderEmit><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>4115200</cMun><xMun>Maringá</xMun><CEP>87000000</CEP><UF>PR</UF></enderEmit></emit>
<dest><CNPJ>${CNPJ_CLI}</CNPJ><xNome>Cliente Beta</xNome><enderDest><xLgr>Rua B</xLgr><cMun>4106902</cMun><xMun>Curitiba</xMun><UF>PR</UF></enderDest></dest>
<vPrest><vTPrest>1500.00</vTPrest></vPrest>
<imp><ICMS><ICMS00><CST>00</CST><vBC>1500.00</vBC><vICMS>180.00</vICMS></ICMS00></ICMS>${extra}</imp>
</infCte></CTe><protCTe><infProt><nProt>141260000000001</nProt><cStat>100</cStat><dhRecbto>2026-10-20T10:01:00-03:00</dhRecbto></infProt></protCTe></cteProc>`;

describe('CT-e (modelo 57): comportamento atual', () => {
  const doc = () => parseFiscalXml(cte()) as ParsedDocument;

  it('lê chave, número, partes, frete e protocolo', () => {
    const d = doc();
    expect(d.kind).toBe('documento');
    expect(d.model).toBe('57');
    expect(d.key).toBe(CHAVE);
    expect(d.number).toBe('123');
    expect(d.emitter).toMatchObject({ cnpj: CNPJ_TRANSP, name: 'Transportadora Alfa', city: 'Maringá', uf: 'PR' });
    expect(d.recipient).toMatchObject({ cnpj: CNPJ_CLI, name: 'Cliente Beta', city: 'Curitiba' });
    expect(d.total).toBe(1500);
    expect(d.vIcms).toBe(180);
    expect(d.cStat).toBe('100');
    expect(d.protocol).toBe('141260000000001');
    expect(d.additionalInfo).toBe('Observação do frete');
  });

  it('vira um item único "FRETE" sem IBS/CBS (limitação conhecida, item 4.4 do plano)', () => {
    const d = doc();
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ code: 'FRETE', cfop: '6353', total: 1500, cstIcms: '00', hasIbsCbs: false, cstIbsCbs: null });
  });

  it('lê o grupo IBSCBS quando o CT-e traz', () => {
    const d = parseFiscalXml(cte('<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></IBSCBS>')) as ParsedDocument;
    expect(d.items[0]).toMatchObject({ hasIbsCbs: true, cstIbsCbs: '000', cClassTrib: '000001' });
  });

  it('o motor audita o CT-e sem quebrar', () => {
    const r = auditDocument(doc(), RULES, { cnpjRoot: CNPJ_CLI.slice(0, 8), cityCode: '4106902', city: 'Curitiba' });
    expect(['ok', 'erro', 'atencao', 'cancelada']).toContain(r.status);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('data de emissão ausente vira erro legível', () => {
    expect(() => parseFiscalXml(cte().replace(/<dhEmi>[^<]*<\/dhEmi>/, ''))).toThrow('Data de emissão');
  });
});

// ---------- present.ts ----------
const regra = (code: string) => ({ ...RULES.find((r) => r.code === code)!, id: code, active: true, version: 1, definition: '{}' });
const achado = (o: Record<string, unknown>) => ({ id: 'f1', documentId: 'd1', itemId: 'i1', ruleCode: 'cfop-cclasstrib-remessa', field: 'cclass_trib', kind: 'tributaria', severity: 'erro', observed: '000001', expected: '410999', createdAt: new Date(), ...o });
const item = { n: 1, cfop: '5949', ncm: '94016100' };
const XML_NFE = '<NFe><infNFe><det nItem="1"><prod><cProd>1</cProd></prod><imposto><cClassTrib>000001</cClassTrib></imposto><infAdProd>texto interno</infAdProd></det><det nItem="2"><prod><cProd>2</cProd></prod></det></infNFe></NFe>';
const present = (f: Record<string, unknown>, doc: Record<string, unknown>, it: unknown = item) =>
  presentFinding(achado(f) as never, regra(String(achado(f).ruleCode)) as never, it as never, { model: '55', emitterCrt: '3', ...doc } as never);

describe('present.ts: texto e trecho de XML do achado', () => {
  it('preenche os marcadores da regra com o item e os valores observados', () => {
    const p = present({}, { xml: XML_NFE });
    expect(p.what).toContain('CFOP 5949');
    expect(p.what).toContain('item 1');
    expect(p.how).toContain('410999');
    expect(p.fixTag).toBe('<cClassTrib>410999</cClassTrib>');
    expect(p.highlight).toBe('cClassTrib');
    expect(p.itemNumber).toBe(1);
    expect(p.action).toBe('cancelar_reemitir');
  });

  it('recorta só o <det> do item, sem o infAdProd, e indenta', () => {
    const s = present({}, { xml: XML_NFE }).xmlSnippet!;
    expect(s).toContain('<!-- det nItem="1" -->');
    expect(s).toContain('<prod>\n  <cProd>1</cProd>\n</prod>');
    expect(s).not.toContain('texto interno');
    expect(s).not.toContain('nItem="2"');
  });

  it('sem XML (exportação) ou sem item, não há trecho', () => {
    expect(present({}, {}).xmlSnippet).toBeNull();
    expect(present({}, { xml: XML_NFE }, null).xmlSnippet).toBeNull();
    expect(present({}, { xml: '<NFe/>' }).xmlSnippet).toBeNull(); // item nao esta no XML
  });

  it('achado ok não traz trecho e usa o título de "conforme"', () => {
    const p = present({ severity: 'ok', observed: '410999' }, { xml: XML_NFE });
    expect(p.xmlSnippet).toBeNull();
    expect(p.title).toBe('cClassTrib da remessa correto');
  });

  it('títulos especiais: nota cancelada e remessa sem cClassTrib', () => {
    expect(present({ ruleCode: 'situacao-sefaz', field: 'situacao', severity: 'atencao', observed: 'cancelada', expected: 'autorizada' }, {}, null).title).toBe('Nota cancelada na SEFAZ');
    expect(present({ observed: 'ausente' }, {}).title).toBe('Remessa sem cClassTrib');
  });

  it('NFS-e: junta os blocos de valores e serviço', () => {
    const xml = '<NFSe><infNFSe><valores><vLiq>950.00</vLiq></valores><DPS><infDPS><serv><cServ><cTribNac>170101</cTribNac></cServ></serv><valores><vServPrest><vServ>1000.00</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>';
    const s = present({ ruleCode: 'nfse-aliquota-iss', field: 'aliquota_iss', observed: '6.00', expected: '2-5' }, { model: 'NFSE', xml }, null).xmlSnippet!;
    expect(s).toContain('<!-- valores da NFS-e -->');
    expect(s).toContain('<!-- servico (DPS) -->');
    expect(s).toContain('<!-- valores (DPS) -->');
    expect(s).toContain('<cTribNac>170101</cTribNac>');
  });
});

describe('present.ts: mensagem ao fornecedor', () => {
  const doc = { direction: 'entrada', emitterName: 'Fornecedor X', number: '77', series: '1', key: 'K'.repeat(44), issuedAt: new Date('2026-10-20T12:00:00-03:00') };
  const erro = (o: Record<string, unknown> = {}) => ({ severity: 'erro', title: 'cClassTrib errado em remessa', itemNumber: 1, observed: '000001', expected: '410999', how: 'associe o CFOP ao cClassTrib 410999', legalBasis: 'LC 214/2025', action: 'conferir', ...o });
  const msg = (d: object, checks: object[], cce = 'USE A CC-E') => supplierMessage(d as never, checks as never, cce);

  it('só existe para nota de entrada com erro', () => {
    expect(msg({ ...doc, direction: 'saida' }, [erro()])).toBeNull();
    expect(msg(doc, [])).toBeNull();
    expect(msg(doc, [erro({ severity: 'atencao' })])).toBeNull();
  });

  it('um erro: texto no singular, com o que está no XML, o esperado, como corrigir e a base legal', () => {
    const m = msg(doc, [erro()])!;
    expect(m).toContain('Olá, Fornecedor X.');
    expect(m).toContain('NF-e nº 77, série 1, emitida em 20/10/2026');
    expect(m).toContain('um erro que precisa de correção');
    expect(m).toContain('1. cClassTrib errado em remessa (item 1)');
    expect(m).toContain('Está no XML: 000001');
    expect(m).toContain('Deveria ser: 410999');
    expect(m).toContain('Como corrigir: Associe o CFOP'); // primeira letra maiuscula
    expect(m).toContain('Base: LC 214/2025');
    expect(m).not.toContain('USE A CC-E');
  });

  it('vários erros: plural e numeração; ação "cancelar e reemitir" acrescenta a nota da CC-e', () => {
    const m = msg(doc, [erro(), erro({ title: 'Outro erro', itemNumber: null, action: 'cancelar_reemitir' })])!;
    expect(m).toContain('2 erros que precisam de correção');
    expect(m).toContain('2. Outro erro');
    expect(m).not.toContain('2. Outro erro (item');
    expect(m).toContain('USE A CC-E');
  });
});
