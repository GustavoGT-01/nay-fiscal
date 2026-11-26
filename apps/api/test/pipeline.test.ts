import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildNfe, cnpjFrom, type BuildItem } from '../prisma/demo/nfe-builder.js';
import { buildNfse } from '../prisma/demo/nfse-builder.js';
import { makeZip, multipart } from './helpers/zip.js';
import { c100, h0000 } from './helpers/sped.js';

// Caminho real do produto: envio multipart -> importacao -> auditoria -> leituras -> exportacao.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-pipeline.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-pipeline.db';
process.env.JWT_SECRET = 'segredo-de-teste-do-pipeline-com-mais-de-32-caracteres';
process.env.TRUST_CF_IP = '1';

let app: FastifyInstance;
let prisma: PrismaClient;
let token = '';
let clientId = '';

const EMPRESA = cnpjFrom('556677880001');
const FORN_BOM = cnpjFrom('112233440001');
const FORN_RUIM = cnpjFrom('998877660001');
const PREST = cnpjFrom('778899110001');
const MGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };
// nome que o Excel trataria como formula se virasse celula de formula
const NOME_FORMULA = '=HYPERLINK("http://mal.example","clique")';

const itemOk: BuildItem = { code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100, icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
// remessa com cClassTrib errado: dispara a regra cfop-cclasstrib-remessa (erro)
const itemRuim: BuildItem = { ...itemOk, cfop: '5949', icms: { table: 'CST', code: '41' }, ibscbs: { cst: '410', cClassTrib: '000001' } };

let n = 700;
const nfe = (emit: string, name: string, items: BuildItem[]) =>
  buildNfe({
    uf: '41', issuedAt: new Date('2026-10-20T10:00:00-03:00'), number: n++, natOp: 'VENDA',
    emitter: { cnpj: emit, name, ...MGA, crt: '3' },
    recipient: { cnpj: EMPRESA, name: 'Empresa Exemplo', ...MGA },
    items,
  }).xml;
const nfseXml = () =>
  buildNfse({
    number: n++, issuedAt: new Date('2026-10-15T10:00:00-03:00'),
    provider: { cnpj: PREST, name: 'Consultoria Alfa', im: '12345', ...MGA, simples: '1' },
    taker: { doc: EMPRESA, name: 'Empresa Exemplo', ...MGA },
    serviceCode: '170101', description: 'Consultoria', value: 1000, rate: 5, ibscbs: true,
  }).xml;

const auth = () => ({ authorization: `Bearer ${token}` });
const get = (url: string) => app.inject({ method: 'GET', url, headers: auth() });

/** Espera uma condicao assincrona (o processamento roda em segundo plano). */
async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, what: string, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (done(v)) return v;
    if (Date.now() > end) throw new Error(`tempo esgotado esperando ${what}`);
    await new Promise((ok) => setTimeout(ok, 60));
  }
}

type UploadRow = { id: string; status: string; total: number; okCount: number; errorCount: number; message: string | null };
async function send(files: { name: string; data: Buffer | string }[], fields: Record<string, string> = { clientId }) {
  const m = await multipart(files, fields);
  const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth(), ...m.headers }, payload: m.payload });
  expect(r.statusCode, r.body).toBe(200);
  const created = r.json() as UploadRow[];
  return Promise.all(created.map((u) => until(async () => (await get(`/api/uploads/${u.id}`)).json() as UploadRow, (x) => x.status !== 'PROCESSANDO' && x.status !== 'PENDENTE', `envio ${u.id}`)));
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const office = await prisma.office.create({ data: { name: 'Escritório' } });
  await prisma.user.create({ data: { name: 'Admin', email: 'admin@p.test', passwordHash: await bcrypt.hash('senha-forte-123', 4), role: 'ADMIN', officeId: office.id } });
  clientId = (await prisma.client.create({ data: { officeId: office.id, name: 'Empresa Exemplo', cnpj: EMPRESA, ...MGA } })).id;
  app = await buildApp();
  await app.ready();
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@p.test', password: 'senha-forte-123' }, headers: { 'cf-connecting-ip': '198.51.100.20' } });
  token = r.json().accessToken;
}, 90_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f, { force: true });
});

describe('envio de arquivos (POST /api/uploads)', () => {
  it('XML avulso entra, e o progresso do envio fecha com a contagem certa', async () => {
    const [u] = await send([{ name: 'boa.xml', data: nfe(FORN_BOM, 'Fornecedor Bom', [itemOk]) }]);
    expect(u.status).toBe('CONCLUIDO');
    expect(u.total).toBe(1);
    expect(u.okCount + u.errorCount).toBe(1);
  });

  it('ZIP com varias notas (NF-e boa, NF-e com erro e NFS-e) entra inteiro', async () => {
    const zip = makeZip([
      { name: 'ruim.xml', data: Buffer.from(nfe(FORN_RUIM, NOME_FORMULA, [itemRuim])) },
      { name: 'servico.xml', data: Buffer.from(nfseXml()) },
      { name: 'leia-me.txt', data: Buffer.from('ignorado') },
    ]);
    const [u] = await send([{ name: 'lote.zip', data: zip }]);
    expect(u.status).toBe('CONCLUIDO');
    expect(u.total).toBe(2); // o .txt de dentro do ZIP nao conta
    expect(u.errorCount).toBeGreaterThanOrEqual(1); // a remessa com cClassTrib errado
    expect(await prisma.document.count({ where: { clientId } })).toBe(3);
  });

  it('XML acima do limite vira ERRO com motivo, sem derrubar a API', async () => {
    const [u] = await send([{ name: 'enorme.xml', data: 'x'.repeat(6 * 1024 * 1024) }]);
    expect(u.status).toBe('ERRO');
    expect(u.message).toContain('grande demais');
  });

  it('arquivo .txt (SPED) com cabeçalho quebrado vira ERRO com mensagem clara', async () => {
    const [u] = await send([{ name: 'sped.txt', data: '|0000|' }]);
    expect(u.status).toBe('ERRO');
    expect(u.message).toContain('SPED');
  });

  it('sem nenhum arquivo no envio: 400', async () => {
    const m = await multipart([], { clientId });
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth(), ...m.headers }, payload: m.payload });
    expect(r.statusCode).toBe(400);
  });
});

describe('leituras sobre dados importados de verdade', () => {
  it('painel soma as notas e separa o que tem erro', async () => {
    const r = await get(`/api/dashboard?clientId=${clientId}`);
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.totals.audited).toBe(3);
    expect(d.totals.erro).toBeGreaterThanOrEqual(1);
    expect(d.barcode).toHaveLength(3);
    expect(d.topErrors.map((e: { code: string }) => e.code)).toContain('cfop-cclasstrib-remessa');
  });

  it('lista de notas pagina e filtra; detalhe traz as verificacoes', async () => {
    const all = (await get(`/api/notes?clientId=${clientId}`)).json();
    expect(all.total).toBe(3);
    expect(all.rows[0]).toMatchObject({ model: expect.any(String), counterpart: expect.any(String) });
    const so = (await get(`/api/notes?clientId=${clientId}&model=NFSE`)).json();
    expect(so.total).toBe(1);
    const erro = (await get(`/api/notes?clientId=${clientId}&status=erro`)).json();
    expect(erro.total).toBeGreaterThanOrEqual(1);
    const pagina = (await get(`/api/notes?clientId=${clientId}&size=1&page=2`)).json();
    expect(pagina.rows).toHaveLength(1);
    const d = (await get(`/api/notes/${erro.rows[0].id}`)).json();
    expect(d.checks.length).toBeGreaterThan(0);
    expect(d.checks.some((c: { severity: string }) => c.severity === 'erro')).toBe(true);
    expect(d.supplierMessage).toContain('Recebemos a NF-e'); // entrada com erro: texto pronto para o fornecedor
  });

  it('resumo de NFS-e, achados por regra e por fornecedor', async () => {
    const s = (await get(`/api/nfse/summary?clientId=${clientId}`)).json();
    expect(s.notes).toBe(1);
    expect(s.serviceValue).toBe(1000);
    expect(s.issValue).toBe(50);
    const regras = (await get(`/api/audit/rules?clientId=${clientId}`)).json() as { code: string; items: number }[];
    expect(regras.find((r) => r.code === 'cfop-cclasstrib-remessa')?.items).toBeGreaterThanOrEqual(1);
    const forn = (await get(`/api/audit/suppliers?clientId=${clientId}`)).json() as { cnpj: string; withError: number }[];
    expect(forn.find((f) => f.cnpj === FORN_RUIM)?.withError).toBe(1);
  });
});

describe('auditoria em segundo plano (POST /api/audit/run)', () => {
  it('roda todas as notas, informa o progresso e termina CONCLUIDA', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/audit/run', headers: auth(), payload: { clientId } });
    expect(r.statusCode).toBe(200);
    const run = r.json() as { id: string; total: number };
    expect(run.total).toBe(3);
    const fim = await until(async () => (await get(`/api/audit/runs/${run.id}`)).json() as { status: string; processed: number; finishedAt: string | null }, (x) => x.status !== 'RODANDO', 'a auditoria');
    expect(fim.status).toBe('CONCLUIDA');
    expect(fim.processed).toBe(3);
    expect(fim.finishedAt).not.toBeNull();
  });

  it('com periodo sem notas, a rodada fecha vazia (total 0)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/audit/run', headers: auth(), payload: { clientId, from: '2030-01-01', to: '2030-01-31' } });
    const run = r.json() as { id: string; total: number };
    expect(run.total).toBe(0);
    const fim = await until(async () => (await get(`/api/audit/runs/${run.id}`)).json() as { status: string }, (x) => x.status !== 'RODANDO', 'a rodada vazia');
    expect(fim.status).toBe('CONCLUIDA');
  });
});

describe('exportacao CSV e XLSX com achados reais', () => {
  it('CSV neutraliza a formula vinda do XML', async () => {
    const r = await get(`/api/audit/export?clientId=${clientId}&format=csv`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.body).toContain(`"'=HYPERLINK`);
    expect(r.body).not.toMatch(/(^|;)"=HYPERLINK/m);
  });

  it('XLSX: planilhas Resumo e Achados, mesma contagem do CSV, e o texto do XML fica como texto (nunca formula)', async () => {
    const csv = (await get(`/api/audit/export?clientId=${clientId}&format=csv`)).body.split('\r\n').filter(Boolean);
    const r = await get(`/api/audit/export?clientId=${clientId}&format=xlsx`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['x-export-truncated']).toBeUndefined();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.rawPayload as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Achados']);
    const achados = wb.getWorksheet('Achados')!;
    expect(achados.rowCount).toBe(csv.length); // cabecalho + uma linha por achado
    let encontrada = false;
    achados.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value).includes('HYPERLINK')) {
          encontrada = true;
          expect(cell.type, 'o nome vindo do XML nao pode virar celula de formula').toBe(ExcelJS.ValueType.String);
          expect(cell.formula).toBeUndefined();
        }
      });
    });
    expect(encontrada).toBe(true);
  });
});

describe('painel e achados por regra: agregação no banco', () => {
  const antiga = async () =>
    prisma.document.create({
      data: {
        clientId, model: '55', key: '9'.repeat(44), number: '1', series: '1', direction: 'entrada', issuedAt: new Date('2025-01-10T12:00:00-03:00'),
        emitterCnpj: FORN_BOM, emitterName: 'Fornecedor Antigo', xml: '<NFe/>', status: 'ok', verdict: 'pode_creditar', total: 99_999_900n, auditedAt: new Date('2026-11-01T12:00:00-03:00'),
      },
    });

  it('nota fora da janela de 15 dias conta nos totais, no maior valor e na última auditoria, mas não vem no gráfico', async () => {
    const antes = (await get(`/api/dashboard?clientId=${clientId}`)).json();
    const velha = await antiga();
    try {
      const d = (await get(`/api/dashboard?clientId=${clientId}`)).json();
      expect(d.totals.audited).toBe(antes.totals.audited + 1);
      expect(d.totals.ok).toBe(antes.totals.ok + 1);
      expect(d.barcode).toHaveLength(antes.barcode.length); // a nota de jan/2025 nao entra na janela
      expect(d.barcode.map((b: { id: string }) => b.id)).not.toContain(velha.id);
      expect(d.verdicts.entradas.pode_creditar).toBe(antes.verdicts.entradas.pode_creditar + 1);
      // o maior valor da carteira inteira (R$ 999.999,00) define o peso das barras: as notas da janela ficam leves
      expect(d.barcode.every((b: { weight: number }) => b.weight === 1)).toBe(true);
      expect(d.lastAuditAt).not.toBeNull();
    } finally {
      await prisma.document.delete({ where: { id: velha.id } });
    }
  });

  it('carteira vazia: painel zerado, sem erro', async () => {
    const vazio = await prisma.client.create({ data: { officeId: (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).officeId, name: 'Vazia', cnpj: cnpjFrom('314159260001'), ...MGA } });
    const d = (await get(`/api/dashboard?clientId=${vazio.id}`)).json();
    expect(d.totals).toEqual({ audited: 0, ok: 0, erro: 0, atencao: 0, cancelada: 0 });
    expect(d.barcode).toEqual([]);
    expect(d.lastAuditAt).toBeNull();
  });

  it('achados por regra somam itens e contam notas distintas, com o número das notas de amostra', async () => {
    const ruim = await prisma.document.findFirstOrThrow({ where: { clientId, emitterName: NOME_FORMULA } });
    const extra = await prisma.finding.create({ data: { documentId: ruim.id, ruleCode: 'cfop-cclasstrib-remessa', field: 'cclass_trib', kind: 'tributaria', severity: 'erro', observed: '000001', expected: '410999' } });
    try {
      const regras = (await get(`/api/audit/rules?clientId=${clientId}&direction=all`)).json() as { code: string; items: number; notes: number; severity: string; sampleNotes: { id: string; number: string }[] }[];
      const g = regras.find((r) => r.code === 'cfop-cclasstrib-remessa')!;
      expect(g.items).toBe(2); // dois achados (itens)...
      expect(g.notes).toBe(1); // ...na mesma nota
      expect(g.severity).toBe('erro');
      expect(g.sampleNotes).toEqual([{ id: ruim.id, number: ruim.number }]);
    } finally {
      await prisma.finding.delete({ where: { id: extra.id } });
    }
  });
});

describe('cache de regras', () => {
  it('guarda a leitura, e syncRules/invalidateRules mostram a edição na hora', async () => {
    const { ruleMap, activeRules, invalidateRules } = await import('../src/models/rule.js');
    invalidateRules();
    const titulo = (await ruleMap()).get('chave-dv')!.title;
    await prisma.rule.update({ where: { code: 'chave-dv' }, data: { title: 'EDITADA NO BANCO' } });
    try {
      expect((await ruleMap()).get('chave-dv')!.title).toBe(titulo); // ainda do cache
      invalidateRules();
      expect((await ruleMap()).get('chave-dv')!.title).toBe('EDITADA NO BANCO');
      // regra desligada sai das ativas, mas continua no mapa de todas
      await prisma.rule.update({ where: { code: 'chave-dv' }, data: { active: false } });
      invalidateRules();
      expect((await activeRules()).some((r) => r.code === 'chave-dv')).toBe(false);
      expect((await ruleMap()).has('chave-dv')).toBe(true);
    } finally {
      await prisma.rule.update({ where: { code: 'chave-dv' }, data: { title: titulo, active: true } });
      invalidateRules();
    }
  });

  it('a mesma leitura serve várias chamadas (uma consulta, não uma por chamada)', async () => {
    const { activeRules, ruleMap, invalidateRules } = await import('../src/models/rule.js');
    invalidateRules();
    const a = await activeRules();
    expect(await activeRules()).toBe(a); // mesma lista, nao uma nova leitura
    expect(await ruleMap()).toBe(await ruleMap());
  });
});

describe('avisos lidos por usuário', () => {
  it('o aviso geral é lido por pessoa; ids de outro escritório são ignorados', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@p.test' } });
    await prisma.user.create({ data: { name: 'Outro', email: 'outro@p.test', passwordHash: await bcrypt.hash('senha-forte-123', 4), role: 'ANALISTA', officeId: admin.officeId } });
    const login2 = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'outro@p.test', password: 'senha-forte-123' }, headers: { 'cf-connecting-ip': '198.51.100.21' } });
    const h2 = { authorization: `Bearer ${login2.json().accessToken}` };

    const geral = await prisma.notification.create({ data: { officeId: admin.officeId, type: 'AVISO', title: 'Geral', message: 'para todos', severity: 'INFO' } });
    const alheio = await prisma.notification.create({ data: { officeId: 'outro-escritorio', type: 'AVISO', title: 'Alheio', message: 'nao e meu', severity: 'INFO' } });
    const lista = async (headers: Record<string, string>) => (await app.inject({ method: 'GET', url: '/api/notifications', headers })).json() as { id: string; readAt: string | null }[];

    expect((await lista(auth())).find((x) => x.id === geral.id)?.readAt).toBeNull();
    const r = await app.inject({ method: 'POST', url: '/api/notifications/read', headers: auth(), payload: { ids: [geral.id, alheio.id] } });
    expect(r.json()).toEqual({ marked: 1 }); // o do outro escritorio nao conta
    expect((await lista(auth())).find((x) => x.id === geral.id)?.readAt).not.toBeNull();
    expect((await lista(h2)).find((x) => x.id === geral.id)?.readAt).toBeNull(); // a outra pessoa ainda nao leu
    expect(await prisma.notificationRead.count({ where: { notificationId: alheio.id } })).toBe(0);

    // sem ids marca tudo; repetir nao marca de novo
    expect((await app.inject({ method: 'POST', url: '/api/notifications/read', headers: h2, payload: {} })).json()).toEqual({ marked: expect.any(Number) });
    expect((await app.inject({ method: 'POST', url: '/api/notifications/read', headers: h2, payload: {} })).json()).toEqual({ marked: 0 });
    expect((await app.inject({ method: 'POST', url: '/api/notifications/read', headers: auth(), payload: { ids: 'x' } })).statusCode).toBe(400);
  });
});

describe('lista de notas: ordenação e paginação estável', () => {
  const lista = async (extra: string, size = 100) => (await get(`/api/notes?clientId=${clientId}&size=${size}${extra}`)).json() as { total: number; rows: { id: string; total: number; issuedAt: string; counterpart: string }[] };

  it('ordena por valor e por data nos dois sentidos', async () => {
    const asc = (await lista('&sort=total&order=asc')).rows.map((r) => r.total);
    const desc = (await lista('&sort=total&order=desc')).rows.map((r) => r.total);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    const datas = (await lista('')).rows.map((r) => r.issuedAt); // padrao: mais recente primeiro
    expect(datas).toEqual([...datas].sort().reverse());
  });

  it('páginas de 1 nota percorrem todas as notas, sem repetir nem pular', async () => {
    const todas = (await lista('')).rows.map((r) => r.id);
    const vistas: string[] = [];
    for (let p = 0; p < todas.length; p++) vistas.push(...(await lista(`&page=${p}&sort=issuedAt`, 1)).rows.map((r) => r.id));
    expect(vistas).toEqual(todas);
  });

  it('coluna fora da lista dá 400', async () => {
    expect((await get(`/api/notes?clientId=${clientId}&sort=number`)).statusCode).toBe(400);
    expect((await get(`/api/notes?clientId=${clientId}&order=sideways`)).statusCode).toBe(400);
  });
});

describe('SPED Fiscal x notas importadas (POST /api/uploads com .txt)', () => {
  const setembro = (n: number) =>
    buildNfe({
      uf: '41', issuedAt: new Date('2026-09-05T12:00:00Z'), number: n, natOp: 'VENDA',
      emitter: { cnpj: FORN_BOM, name: 'Fornecedor Bom', ...MGA, crt: '3' },
      recipient: { cnpj: EMPRESA, name: 'Empresa Exemplo', ...MGA },
      items: [{ ...itemOk, unit: 100 + n }],
    }).xml;
  const reais = (c: bigint) => (Number(c) / 100).toFixed(2).replace('.', ',');
  const NUMEROS = [9101, 9102, 9103, 9104];

  it('aponta valor diferente, situação diferente, nota sem XML e nota fora do SPED; a nota certa não gera nada', async () => {
    await send(NUMEROS.map((n) => ({ name: `s${n}.xml`, data: setembro(n) })));
    const docs = await prisma.document.findMany({ where: { clientId, number: { in: NUMEROS.map(String) } }, orderBy: { number: 'asc' } });
    expect(docs).toHaveLength(4);
    const [certa, valor, cancel, fora] = docs as [typeof docs[number], typeof docs[number], typeof docs[number], typeof docs[number]];
    const linha = (d: typeof certa, o: { total?: string; sit?: string } = {}) =>
      c100({ key: d.key, num: d.number, total: o.total ?? reais(d.total), icms: reais(d.vIcms), sit: o.sit, dt: '05092026' });
    const semXml = '9'.repeat(44);
    const txt = [h0000(EMPRESA), linha(certa), linha(valor, { total: '1,23' }), linha(cancel, { sit: '02' }), c100({ key: semXml, num: '1' }), '|9999|6|'].join('\r\n');

    const [up] = await send([{ name: 'EFD-092026.txt', data: Buffer.from(txt, 'latin1') }]);
    expect(up.status).toBe('CONCLUIDO');
    expect(up.total).toBe(4);
    expect(up.message).toContain('4 divergência(s)');

    const files = (await get(`/api/sped?clientId=${clientId}`)).json() as { id: string; entries: number; divergenceCount: number; fileName: string }[];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ fileName: 'EFD-092026.txt', entries: 4, divergenceCount: 4 });

    const det = (await get(`/api/sped/${files[0]!.id}`)).json() as { kinds: Record<string, number>; total: number; rows: { kind: string; number: string }[] };
    expect(det.kinds).toEqual({ valor: 1, situacao: 1, sem_xml: 1, fora_do_sped: 1 });
    expect(det.rows.find((r) => r.kind === 'fora_do_sped')!.number).toBe(fora.number);
    expect(det.rows.some((r) => r.number === certa.number)).toBe(false);
    const soValor = (await get(`/api/sped/${files[0]!.id}?kind=valor`)).json() as { total: number };
    expect(soValor.total).toBe(1);
    expect((await get(`/api/sped/${files[0]!.id}?kind=lixo`)).statusCode).toBe(400);
    expect((await get(`/api/sped/naoexiste`)).statusCode).toBe(404);
  });

  it('SPED de outro CNPJ, sem cliente cadastrado ou sem registro 0000 vira ERRO com motivo claro', async () => {
    const [outro] = await send([{ name: 'a.txt', data: [h0000(FORN_BOM), c100({ key: '1'.repeat(44) })].join('\n') }]);
    expect(outro.status).toBe('ERRO');
    expect(outro.message).toContain('não é do cliente');
    const [semCliente] = await send([{ name: 'b.txt', data: h0000(cnpjFrom('271828180001')) }], { clientId: 'auto' });
    expect(semCliente.status).toBe('ERRO');
    expect(semCliente.message).toContain('Nenhum cliente');
    const [lixo] = await send([{ name: 'c.txt', data: 'isto nao e sped' }]);
    expect(lixo.status).toBe('ERRO');
    expect(lixo.message).toContain('0000');
    expect(await prisma.spedFile.count({ where: { clientId } })).toBe(1); // os com erro nao guardam nada
  });
});
