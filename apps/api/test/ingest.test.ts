import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { buildNfe, cnpjFrom, type BuildItem } from '../prisma/demo/nfe-builder.js';

// Contam as chamadas das funcoes da camada models (passam direto para o banco).
vi.mock('../src/models/rule.js', async (original) => {
  const m = await original<typeof import('../src/models/rule.js')>();
  return { ...m, activeRules: vi.fn(m.activeRules) };
});
vi.mock('../src/models/client.js', async (original) => {
  const m = await original<typeof import('../src/models/client.js')>();
  return { ...m, findById: vi.fn(m.findById) };
});

// Importacao em lote: o motivo de cada falha aparece no envio, e o lote nao repete consultas por nota.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-ingest.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-ingest.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let prisma: PrismaClient;
let processUpload: (id: string, files: { name: string; xml: string }[]) => Promise<void>;
let officeId = '';
let clientId = '';

const EMPRESA = cnpjFrom('556677880001');
const FORN = cnpjFrom('112233440001');
const MGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };
const item: BuildItem = { code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100, icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
let n = 500;
const nota = () =>
  buildNfe({
    uf: '41', issuedAt: new Date('2026-10-20T10:00:00-03:00'), number: n++, natOp: 'VENDA',
    emitter: { cnpj: FORN, name: 'Fornecedor', ...MGA, crt: '3' },
    recipient: { cnpj: EMPRESA, name: 'Empresa', ...MGA },
    items: [item],
  }).xml;

async function upload(files: { name: string; xml: string }[]) {
  const up = await prisma.upload.create({ data: { officeId, clientId, fileName: 'lote.zip', kind: 'ZIP' } });
  await processUpload(up.id, files);
  return prisma.upload.findUniqueOrThrow({ where: { id: up.id } });
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  ({ processUpload } = await import('../src/services/ingest/process-upload.js'));
  const { RULES } = await import('../src/engine/catalog.js');
  for (const r of RULES) await prisma.rule.create({ data: { ...r, definition: JSON.stringify(r.definition) } });
  officeId = (await prisma.office.create({ data: { name: 'Escritório' } })).id;
  clientId = (await prisma.client.create({ data: { officeId, name: 'Empresa', cnpj: EMPRESA, ...MGA } })).id;
}, 90_000);

afterAll(async () => {
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
});

describe('motivo das falhas no envio', () => {
  it('diz qual arquivo falhou e por que, e importa os demais', async () => {
    const semData = nota().replace(/<dhEmi>[^<]*<\/dhEmi>/, '<dhEmi>ontem</dhEmi>');
    const u = await upload([
      { name: 'boa.xml', xml: nota() },
      { name: 'sem-data.xml', xml: semData },
      { name: 'lixo.xml', xml: 'isto nao e um xml fiscal' },
    ]);
    expect(u.okCount + u.errorCount).toBe(1);
    expect(u.message).toContain('2 arquivo(s) não importado(s)');
    expect(u.message).toContain('sem-data.xml — Data de emissão (dhEmi) ausente ou inválida no XML');
    expect(u.message).toContain('lixo.xml');
  });

  it('mostra no maximo 3 arquivos na mensagem, mesmo com muitas falhas', async () => {
    const u = await upload(Array.from({ length: 6 }, (_, i) => ({ name: `ruim${i}.xml`, xml: 'x' })));
    expect(u.message).toContain('6 arquivo(s) não importado(s)');
    expect(u.message).toContain('ruim2.xml');
    expect(u.message).not.toContain('ruim3.xml');
  });
});

describe('consultas por lote, nao por nota', () => {
  it('le as regras e o cliente uma vez, e nao a cada nota', async () => {
    const { activeRules } = await import('../src/models/rule.js');
    const { findById } = await import('../src/models/client.js');
    (activeRules as Mock).mockClear();
    (findById as Mock).mockClear();
    await upload(Array.from({ length: 8 }, (_, i) => ({ name: `n${i}.xml`, xml: nota() })));
    // antes: regras lidas 1x por nota, e o cliente 2x por nota (importacao + auditoria)
    expect((activeRules as Mock).mock.calls.length).toBeLessThanOrEqual(1);
    expect((findById as Mock).mock.calls.length).toBeLessThanOrEqual(1);
    expect(await prisma.document.count({ where: { clientId } })).toBeGreaterThanOrEqual(8);
  });
});
