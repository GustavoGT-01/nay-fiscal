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

  it('arquivo .txt (SPED) e recusado por enquanto, com mensagem clara', async () => {
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
