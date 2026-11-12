import { describe, expect, it } from 'vitest';
import { buildNfe, cnpjFrom, type BuildItem } from '../prisma/demo/nfe-builder.js';
import { parseFiscalXml, accessKeyDv, type ParsedDocument } from '../src/xml/nfe-parser.js';
import { auditDocument, verdictFor } from '../src/engine/evaluator.js';
import { RULES } from '../src/engine/catalog.js';

const CLIENT = cnpjFrom('112223330001');
const SUP = cnpjFrom('112233440001');
const client = { cnpjRoot: CLIENT.slice(0, 8), cityCode: '4115200', city: 'Maringá' };

function nota(items: Partial<BuildItem>[], extra: { crt?: '1' | '2' | '3'; date?: string; cStat?: '100' | '101' } = {}) {
  const { xml } = buildNfe({
    uf: '41',
    issuedAt: new Date(extra.date ?? '2026-10-20T10:00:00-03:00'),
    number: 4236,
    natOp: 'TESTE',
    emitter: { cnpj: SUP, name: 'Fornecedor', city: 'Maringá', cityCode: '4115200', uf: 'PR', crt: extra.crt ?? '3' },
    recipient: { cnpj: CLIENT, name: 'Cliente', city: 'Maringá', cityCode: '4115200', uf: 'PR' },
    cStat: extra.cStat,
    items: items.map((p) => ({
      code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100,
      icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true }, ...p,
    })),
  });
  return parseFiscalXml(xml) as ParsedDocument;
}
const run = (d: ParsedDocument) => auditDocument(d, RULES, client);
const sev = (r: ReturnType<typeof run>, code: string) => r.findings.filter((f) => f.ruleCode === code).map((f) => f.severity);

describe('parser', () => {
  it('lê itens, IBS/CBS e mantém zeros à esquerda', () => {
    const d = nota([{ ibscbs: { cst: '000', cClassTrib: '000001', valores: true } }]);
    expect(d.items[0].cstIbsCbs).toBe('000');
    expect(d.items[0].cClassTrib).toBe('000001');
    expect(d.items[0].vCbs).toBeGreaterThan(0);
    expect(d.emitter.crt).toBe('3');
  });
});

describe('motor', () => {
  it('DV da chave confere', () => {
    expect(accessKeyDv('3526102694750800019555001000004236144820635')).toBe(5);
  });

  it('venda correta fica ok', () => {
    const r = run(nota([{}]));
    expect(r.status).toBe('ok');
  });

  it('remessa sem cClassTrib 410999 é erro', () => {
    const r = run(nota([{ cfop: '5949', icms: { table: 'CST', code: '41' }, ibscbs: { cst: '410', cClassTrib: '000001' } }]));
    expect(sev(r, 'cfop-cclasstrib-remessa')).toEqual(['erro']);
    expect(r.status).toBe('erro');
  });

  it('remessa com valores de IBS/CBS é erro', () => {
    const r = run(nota([{ cfop: '6912', ibscbs: { cst: '410', cClassTrib: '410999', valores: true } }]));
    expect(sev(r, 'cfop-sem-valores-ibs-cbs')).toEqual(['erro']);
  });

  it('nota após 03/08/2026 sem grupo IBSCBS é erro', () => {
    const r = run(nota([{ ibscbs: undefined }]));
    expect(sev(r, 'ibscbs-obrigatorio')).toEqual(['erro']);
  });

  it('antes de 03/08/2026 o grupo não é exigido', () => {
    const r = run(nota([{ ibscbs: undefined }], { date: '2026-05-10T10:00:00-03:00' }));
    expect(sev(r, 'ibscbs-obrigatorio')).toEqual([]);
  });

  it('CRT 1 com CST é erro; CSOSN com PIS 01 é atenção', () => {
    expect(sev(run(nota([{}], { crt: '1' })), 'crt1-icms-por-cst')).toEqual(['erro']);
    const r = run(nota([{ icms: { table: 'CSOSN', code: '102' }, pis: '01' }], { crt: '1' }));
    expect(sev(r, 'cst-pis-atipico-simples')).toEqual(['atencao']);
    expect(r.status).toBe('atencao');
  });

  it('cClassTrib que não começa pelo CST é erro', () => {
    const r = run(nota([{ ibscbs: { cst: '200', cClassTrib: '000001', valores: true } }]));
    expect(sev(r, 'cst-cclasstrib-coerencia')).toEqual(['erro']);
  });

  it('CFOP sem regra vira a verificar sem mudar o status', () => {
    const r = run(nota([{ cfop: '5551' }]));
    expect(sev(r, 'cfop-sem-regra-ibs-cbs')).toEqual(['a_verificar']);
    expect(r.status).toBe('ok');
  });

  it('nota cancelada', () => {
    expect(run(nota([{}], { cStat: '101' })).status).toBe('cancelada');
  });
});

describe('veredito', () => {
  const verdict = (dir: 'entrada' | 'saida', d: ParsedDocument) => {
    const r = run(d);
    return verdictFor(dir, r.status, r.findings, RULES);
  };
  const remessaErrada = { cfop: '5949', icms: { table: 'CST' as const, code: '41' }, ibscbs: { cst: '410', cClassTrib: '000001' } };

  it('regras que definem o imposto pedem cancelar e reemitir', () => {
    expect(RULES.find((r) => r.code === 'cfop-cclasstrib-remessa')?.action).toBe('cancelar_reemitir');
    expect(RULES.find((r) => r.code === 'destino-cadastro')?.action).toBe('conferir');
  });

  it('entrada correta pode creditar', () => {
    expect(verdict('entrada', nota([{}]))).toBe('pode_creditar');
  });

  it('entrada com atenção ainda pode creditar', () => {
    expect(verdict('entrada', nota([{ icms: { table: 'CSOSN', code: '102' }, pis: '01' }], { crt: '1' }))).toBe('pode_creditar');
  });

  it('entrada com cClassTrib errado deixa o crédito em risco', () => {
    expect(verdict('entrada', nota([remessaErrada]))).toBe('credito_em_risco');
  });

  it('entrada cancelada não credita', () => {
    expect(verdict('entrada', nota([{}], { cStat: '101' }))).toBe('nao_creditar');
  });

  it('saída correta', () => {
    expect(verdict('saida', nota([{}]))).toBe('correta');
  });

  it('saída com IBS/CBS em remessa pede cancelar e reemitir', () => {
    expect(verdict('saida', nota([{ cfop: '6912', ibscbs: { cst: '410', cClassTrib: '410999', valores: true } }]))).toBe('cancelar_reemitir');
  });

  it('saída com erro só em regra de conferir pede corrigir', () => {
    const v = verdictFor('saida', 'erro', [{ ruleCode: 'chave-dv', severity: 'erro' }], RULES);
    expect(v).toBe('corrigir');
  });

  it('saída cancelada', () => {
    expect(verdict('saida', nota([remessaErrada], { cStat: '101' }))).toBe('cancelada');
  });
});
