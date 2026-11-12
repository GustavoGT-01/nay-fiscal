import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildNfe, cnpjFrom, type BuildItem } from '../prisma/demo/nfe-builder.js';

// Banco isolado so para este teste (nunca o dev.db).
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-clients.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-clients.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let app: FastifyInstance;
let prisma: PrismaClient;
let processUpload: (id: string, files: { name: string; xml: string }[]) => Promise<void>;
let officeId = '';
let admin = '';
let analista = '';

const EMPRESA = cnpjFrom('556677880001');
const FILIAL = cnpjFrom('556677880002');
const FORN1 = cnpjFrom('112233440001');
const FORN2 = cnpjFrom('998877660001');
const OUTRA = cnpjFrom('123123120001');
const MGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };
const item: BuildItem = { code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100, icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
let n = 100;
const nota = (emit: string, dest: string, crt: '1' | '3' = '3') =>
  buildNfe({
    uf: '41', issuedAt: new Date('2026-10-20T10:00:00-03:00'), number: n++, natOp: 'VENDA',
    emitter: { cnpj: emit, name: 'Emp ' + emit.slice(0, 4), ...MGA, crt },
    recipient: { cnpj: dest, name: 'Emp ' + dest.slice(0, 4), ...MGA },
    items: [item],
  }).xml;

async function upload(files: string[], clientId: string | null = null) {
  const up = await prisma.upload.create({ data: { officeId, clientId, fileName: 'lote.zip', kind: 'ZIP' } });
  await processUpload(up.id, files.map((xml, i) => ({ name: `n${i}.xml`, xml })));
  return prisma.upload.findUniqueOrThrow({ where: { id: up.id } });
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  ({ processUpload } = await import('../src/services/ingest/process-upload.js'));
  const { RULES } = await import('../src/engine/catalog.js');
  for (const r of RULES) await prisma.rule.create({ data: { ...r, definition: JSON.stringify(r.definition) } });
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash('senha123', 4);
  officeId = (await prisma.office.create({ data: { name: 'Escritório' } })).id;
  const profile = await prisma.profile.create({ data: { officeId, name: 'Analista', permissions: JSON.stringify(['clientes', 'importar']) } });
  await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.test', passwordHash, role: 'ADMIN', officeId } });
  await prisma.user.create({ data: { name: 'Ana', email: 'ana@t.test', passwordHash, role: 'ANALISTA', officeId, profileId: profile.id } });
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
  await app.ready();
  const login = async (email: string) => (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'senha123' } })).json().accessToken as string;
  admin = await login('admin@t.test');
  analista = await login('ana@t.test');
}, 90_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
});

describe('importação detecta o cliente', () => {
  it('lote de entradas cria só a empresa que se repete, não os fornecedores', async () => {
    const u = await upload([nota(FORN1, EMPRESA), nota(FORN2, EMPRESA), nota(FORN1, EMPRESA)]);
    const clients = await prisma.client.findMany({ where: { officeId } });
    expect(clients.map((c) => c.cnpj)).toEqual([EMPRESA]);
    expect(JSON.parse(u.createdClients)).toHaveLength(1);
    expect(await prisma.document.count({ where: { clientId: clients[0].id, direction: 'entrada' } })).toBe(3);
    expect(u.clientId).toBe(clients[0].id);
  });

  it('nota de saída vai para o cliente que já existe', async () => {
    const u = await upload([nota(EMPRESA, OUTRA, '1')]);
    expect(JSON.parse(u.createdClients)).toEqual([]);
    expect(await prisma.document.count({ where: { direction: 'saida' } })).toBe(1);
  });

  it('filial entra como estabelecimento do mesmo cliente', async () => {
    await upload([nota(FORN2, FILIAL)]);
    const c = await prisma.client.findFirstOrThrow({ where: { cnpj: EMPRESA }, include: { establishments: true } });
    expect(c.establishments.map((e) => e.cnpj).sort()).toEqual([EMPRESA, FILIAL].sort());
    expect(await prisma.client.count({ where: { officeId } })).toBe(1);
  });

  it('nota avulsa sem nenhuma empresa conhecida é pulada', async () => {
    const u = await upload([nota(FORN1, FORN2)]);
    expect(u.skipped).toBe(1);
    expect(u.message).toMatch(/sem cliente identificado/);
    expect(await prisma.client.count({ where: { officeId } })).toBe(1);
  });

  it('com cliente escolhido, nota de outra empresa é pulada', async () => {
    const c = await prisma.client.findFirstOrThrow({ where: { cnpj: EMPRESA } });
    const u = await upload([nota(FORN1, OUTRA), nota(FORN1, EMPRESA)], c.id);
    expect(u.skipped).toBe(1);
    expect(u.okCount + u.errorCount).toBe(1);
    expect(u.message).toMatch(/não são de/);
  });
});

describe('cadastro de clientes', () => {
  const H = () => ({ authorization: `Bearer ${admin}` });

  it('recusa CNPJ inválido e raiz repetida', async () => {
    let r = await app.inject({ method: 'POST', url: '/api/clients', headers: H(), payload: { cnpj: '11111111111111', name: 'X', regime: 'LUCRO_REAL' } });
    expect(r.statusCode).toBe(400);
    r = await app.inject({ method: 'POST', url: '/api/clients', headers: H(), payload: { cnpj: cnpjFrom('556677880003'), name: 'Filial', regime: 'LUCRO_REAL' } });
    expect(r.statusCode).toBe(409);
  });

  it('cria, edita e exclui com confirmação', async () => {
    const cnpj = cnpjFrom('445566770001');
    let r = await app.inject({ method: 'POST', url: '/api/clients', headers: H(), payload: { cnpj, name: 'Nova Ltda', regime: 'SIMPLES_NACIONAL', city: 'Curitiba', uf: 'pr', cityCode: '4106902' } });
    expect(r.statusCode).toBe(201);
    const id = r.json().id as string;
    const c = await prisma.client.findUniqueOrThrow({ where: { id }, include: { establishments: true } });
    expect(c.uf).toBe('PR');
    expect(c.establishments[0].label).toBe('Matriz');
    r = await app.inject({ method: 'PATCH', url: `/api/clients/${id}`, headers: H(), payload: { name: 'Nova S.A.', regime: 'LUCRO_PRESUMIDO' } });
    expect(r.statusCode).toBe(200);
    expect((await prisma.client.findUniqueOrThrow({ where: { id } })).regime).toBe('LUCRO_PRESUMIDO');
    r = await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, headers: H(), payload: {} });
    expect(r.statusCode).toBe(400);
    r = await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, headers: H(), payload: { confirm: 'APAGAR' } });
    expect(r.statusCode).toBe(200);
    expect(await prisma.client.findUnique({ where: { id } })).toBeNull();
  });

  it('analista sem permissão não cadastra nem exclui', async () => {
    const h = { authorization: `Bearer ${analista}` };
    const c = await prisma.client.findFirstOrThrow({ where: { cnpj: EMPRESA } });
    expect((await app.inject({ method: 'POST', url: '/api/clients', headers: h, payload: { cnpj: cnpjFrom('778899000001'), name: 'Y', regime: 'MEI' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/clients/${c.id}`, headers: h, payload: { confirm: 'APAGAR' } })).statusCode).toBe(403);
  });

  it('cliente sem notas aparece sem conformidade', async () => {
    await app.inject({ method: 'POST', url: '/api/clients', headers: H(), payload: { cnpj: cnpjFrom('101010100001'), name: 'Vazia', regime: 'MEI' } });
    const list = (await app.inject({ method: 'GET', url: '/api/clients', headers: H() })).json() as { name: string; conformity: number | null }[];
    expect(list.find((x) => x.name === 'Vazia')?.conformity).toBeNull();
  });
});
