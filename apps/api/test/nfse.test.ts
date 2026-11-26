import { describe, expect, it } from 'vitest';
import { buildNfse, type BuildNfse } from '../prisma/demo/nfse-builder.js';
import { cnpjFrom } from '../prisma/demo/nfe-builder.js';
import { parseFiscalXml, type ParsedDocument } from '../src/xml/nfe-parser.js';
import { auditDocument, verdictFor } from '../src/engine/evaluator.js';
import { RULES } from '../src/engine/catalog.js';
import { faixaIss, julgarAliquota } from '../src/engine/iss-municipal.js';

const PREST = cnpjFrom('778899110001');
const TOMA = cnpjFrom('112223330001');
const MGA = { cityCode: '4115200', city: 'Maringá', uf: 'PR' };
const client = { cnpjRoot: TOMA.slice(0, 8), cityCode: '4115200', city: 'Maringá' };

const nfse = (p: Partial<BuildNfse> = {}) =>
  parseFiscalXml(buildNfse({
    number: 501, issuedAt: new Date('2026-10-15T10:00:00-03:00'),
    provider: { cnpj: PREST, name: 'Consultoria Alfa', im: '12345', ...MGA, simples: '1' },
    taker: { doc: TOMA, name: 'Empresa Exemplo', ...MGA },
    serviceCode: '170101', description: 'Consultoria', value: 1000, rate: 5, ibscbs: true, ...p,
  }).xml) as ParsedDocument;
const run = (d: ParsedDocument) => auditDocument(d, RULES, client);
const sev = (r: ReturnType<typeof run>, code: string) => r.findings.filter((f) => f.ruleCode === code).map((f) => f.severity);

describe('NFS-e nacional', () => {
  it('lê prestador, tomador, serviço e ISS', () => {
    const d = nfse({ retention: '2', irrf: 15 });
    expect(d.model).toBe('NFSE');
    expect(d.emitter.cnpj).toBe(PREST);
    expect(d.recipient.cnpj).toBe(TOMA);
    expect(d.nfse?.serviceCode).toBe('170101');
    expect(d.nfse?.issValue).toBe(50);
    expect(d.nfse?.issRetention).toBe('2');
    expect(d.nfse?.retentionsTotal).toBe(65);
    expect(d.nfse?.netValue).toBe(935);
  });

  it('nota correta fica ok e o tomador pode creditar', () => {
    const r = run(nfse());
    expect(r.status).toBe('ok');
    expect(verdictFor('entrada', r.status, r.findings, RULES)).toBe('pode_creditar');
  });

  it('alíquota acima de 5% é erro e pede cancelar e reemitir na saída', () => {
    const r = run(nfse({ rate: 6 }));
    expect(sev(r, 'nfse-aliquota-iss')).toEqual(['erro']);
    expect(verdictFor('saida', r.status, r.findings, RULES)).toBe('cancelar_reemitir');
  });

  it('ISS diferente de base × alíquota é erro', () => {
    expect(sev(run(nfse({ issOverride: 30 })), 'nfse-calculo-iss')).toEqual(['erro']);
  });

  it('serviço imune com ISS destacado é erro', () => {
    expect(sev(run(nfse({ tributacao: '2', issOverride: 50 })), 'nfse-iss-sem-tributacao')).toEqual(['erro']);
  });

  it('MEI sem ISS fica ok; código de serviço inválido é erro', () => {
    const mei = run(nfse({ provider: { cnpj: PREST, name: 'MEI', ...MGA, simples: '2' } }));
    expect(sev(mei, 'nfse-mei-iss')).toEqual(['ok']);
    expect(sev(run(nfse({ serviceCode: '1701' })), 'nfse-codigo-servico')).toEqual(['erro']);
  });

  it('retenção por pessoa física e falta do grupo IBS/CBS são atenção', () => {
    expect(sev(run(nfse({ retention: '2', taker: { doc: '12345678909', name: 'Fulano', ...MGA } })), 'nfse-retencao-tomador')).toEqual(['atencao']);
    const r = run(nfse({ ibscbs: false }));
    expect(sev(r, 'nfse-ibscbs')).toEqual(['atencao']);
    expect(r.status).toBe('atencao');
  });

  it('não aplica regras de NF-e (chave de 44 dígitos, CFOP)', () => {
    const codes = run(nfse()).findings.map((f) => f.ruleCode);
    expect(codes).not.toContain('chave-dv');
    expect(codes.some((c) => c.startsWith('cfop'))).toBe(false);
  });
});

describe('faixa do ISS', () => {
  it('abaixo de 2% sem tabela do município é "a verificar", não erro', () => {
    const r = run(nfse({ rate: 1 }));
    expect(sev(r, 'nfse-aliquota-iss')).toEqual(['a_verificar']);
    expect(r.status).not.toBe('erro');
  });

  it('acima de 5% é sempre erro, com ou sem tabela', () => {
    expect(julgarAliquota(5.01, faixaIss('4115200', '170101', '1'))).toBe('erro');
    expect(julgarAliquota(5.01, faixaIss('9999999', '170101', '1', { '9999999': { min: 2, max: 6, fonte: 't', vigencia: '2026-01-01' } }))).toBe('erro');
  });

  it('itens 7.02, 7.05 e 16.01 e ME/EPP podem ficar abaixo de 2%', () => {
    for (const cod of ['070201', '070501', '160101']) expect(julgarAliquota(1, faixaIss('4115200', cod, '1'))).toBe('ok');
    expect(julgarAliquota(1, faixaIss('4115200', '170101', '3'))).toBe('ok');
    expect(julgarAliquota(1, faixaIss('4115200', '170101', '1'))).toBe('a_verificar');
  });

  it('com a faixa do município cadastrada, fora dela é erro (inclusive abaixo do piso) e dentro é ok', () => {
    const tabela = { '4115200': { min: 3, max: 4, fonte: 'lei municipal de teste', vigencia: '2026-01-01' } };
    const f = faixaIss('4115200', '070201', '3', tabela);
    expect(f.origem).toBe('municipio');
    expect(julgarAliquota(2, f)).toBe('erro');
    expect(julgarAliquota(3.5, f)).toBe('ok');
    expect(julgarAliquota(4.5, f)).toBe('erro');
  });
});
