import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// Banco isolado so para este teste (nunca o dev.db).
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-admin.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-admin.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let app: FastifyInstance;
let prisma: PrismaClient;
const ids = { clientA: '', clientA2: '', clientB: '', docA: '', docB: '' };
let adminToken = '';
let analistaToken = '';

async function addDoc(clientId: string, key: string) {
  const d = await prisma.document.create({
    data: {
      clientId, model: '55', key, number: key.slice(-4), series: '1', direction: 'entrada', issuedAt: new Date('2026-10-20T10:00:00-03:00'),
      emitterCnpj: '11222333000181', emitterName: 'Fornecedor', xml: '<NFe/>',
      items: { create: [{ n: 1, description: 'Item', cfop: '5102' }] },
    },
    include: { items: true },
  });
  await prisma.finding.create({ data: { documentId: d.id, itemId: d.items[0].id, ruleCode: 'R1', field: 'cfop', kind: 'tecnica', severity: 'erro', observed: 'x', expected: 'y' } });
  return d.id;
}

async function login(email: string) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'senha123' } });
  return r.json().accessToken as string;
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });

  ({ prisma } = await import('../src/config/db.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash('senha123', 4);

  const officeA = await prisma.office.create({ data: { name: 'Escritório A' } });
  const officeB = await prisma.office.create({ data: { name: 'Escritório B' } });
  const profile = await prisma.profile.create({ data: { officeId: officeA.id, name: 'Analista', permissions: JSON.stringify(['inicio', 'notas', 'auditoria']) } });
  await prisma.user.create({ data: { name: 'Admin A', email: 'admin@a.test', passwordHash, role: 'ADMIN', officeId: officeA.id } });
  await prisma.user.create({ data: { name: 'Analista A', email: 'analista@a.test', passwordHash, role: 'ANALISTA', officeId: officeA.id, profileId: profile.id } });
  await prisma.user.create({ data: { name: 'Admin B', email: 'admin@b.test', passwordHash, role: 'ADMIN', officeId: officeB.id } });
  ids.clientA = (await prisma.client.create({ data: { officeId: officeA.id, name: 'Cliente A1', cnpj: '00000000000101' } })).id;
  ids.clientA2 = (await prisma.client.create({ data: { officeId: officeA.id, name: 'Cliente A2', cnpj: '00000000000102' } })).id;
  ids.clientB = (await prisma.client.create({ data: { officeId: officeB.id, name: 'Cliente B1', cnpj: '00000000000201' } })).id;
  ids.docA = await addDoc(ids.clientA, '41000000000000000000000000000000000000000001');
  await addDoc(ids.clientA, '41000000000000000000000000000000000000000002');
  await addDoc(ids.clientA2, '41000000000000000000000000000000000000000003');
  ids.docB = await addDoc(ids.clientB, '41000000000000000000000000000000000000000004');
  await prisma.upload.create({ data: { clientId: ids.clientA2, fileName: 'lote.zip', kind: 'ZIP' } });
  await prisma.auditRun.create({ data: { clientId: ids.clientA2, status: 'CONCLUIDO' } });

  app = await buildApp();
  await app.ready();
  adminToken = await login('admin@a.test');
  analistaToken = await login('analista@a.test');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f, { force: true });
});

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe('apagar dados (somente ADMIN)', () => {
  it('analista recebe 403 em todas as rotas de apagar', async () => {
    const calls = [
      app.inject({ method: 'DELETE', url: `/api/notes/${ids.docA}`, headers: auth(analistaToken) }),
      app.inject({ method: 'DELETE', url: `/api/clients/${ids.clientA}/documents`, headers: auth(analistaToken) }),
      app.inject({ method: 'DELETE', url: '/api/data/documents', headers: auth(analistaToken), payload: { confirm: 'APAGAR' } }),
      app.inject({ method: 'GET', url: '/api/admin/summary', headers: auth(analistaToken) }),
    ];
    for (const r of await Promise.all(calls)) expect(r.statusCode).toBe(403);
    expect(await prisma.document.count({ where: { id: ids.docA } })).toBe(1);
  });

  it('sem token recebe 401', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/notes/${ids.docA}` });
    expect(r.statusCode).toBe(401);
  });

  it('admin nao apaga nota de outro escritorio', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/notes/${ids.docB}`, headers: auth(adminToken) });
    expect(r.statusCode).toBe(404);
    const c = await app.inject({ method: 'DELETE', url: `/api/clients/${ids.clientB}/documents`, headers: auth(adminToken) });
    expect(c.statusCode).toBe(404);
    expect(await prisma.document.count({ where: { id: ids.docB } })).toBe(1);
  });

  it('admin apaga uma nota com itens e achados', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/notes/${ids.docA}`, headers: auth(adminToken) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ documents: 1, items: 1, findings: 1 });
    expect(await prisma.document.count({ where: { id: ids.docA } })).toBe(0);
    expect(await prisma.documentItem.count({ where: { documentId: ids.docA } })).toBe(0);
    expect(await prisma.finding.count({ where: { documentId: ids.docA } })).toBe(0);
    const n = await prisma.notification.findFirst({ where: { title: 'Notas apagadas' } });
    expect(n?.message).toContain('Admin A');
  });

  it('resumo mostra notas e envios por cliente', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/admin/summary', headers: auth(adminToken) });
    expect(r.statusCode).toBe(200);
    const rows = r.json() as { name: string; notes: number; uploads: number }[];
    expect(rows.map((x) => [x.name, x.notes, x.uploads])).toEqual([['Cliente A1', 1, 0], ['Cliente A2', 1, 1]]);
  });

  it('admin apaga as notas de um cliente', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/clients/${ids.clientA}/documents`, headers: auth(adminToken) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ documents: 1 });
    expect(await prisma.document.count({ where: { clientId: ids.clientA } })).toBe(0);
    expect(await prisma.document.count({ where: { clientId: ids.clientA2 } })).toBe(1);
  });

  it('limpeza do escritorio exige confirmacao e mantem usuarios e clientes', async () => {
    const no = await app.inject({ method: 'DELETE', url: '/api/data/documents', headers: auth(adminToken), payload: { confirm: 'apagar' } });
    expect(no.statusCode).toBe(400);
    const empty = await app.inject({ method: 'DELETE', url: '/api/data/documents', headers: auth(adminToken) });
    expect(empty.statusCode).toBe(400);
    expect(await prisma.document.count({ where: { clientId: ids.clientA2 } })).toBe(1);

    const ok = await app.inject({ method: 'DELETE', url: '/api/data/documents', headers: auth(adminToken), payload: { confirm: 'APAGAR' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ documents: 1, uploads: 1, auditRuns: 1 });
    expect(await prisma.document.count({ where: { clientId: { in: [ids.clientA, ids.clientA2] } } })).toBe(0);
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.client.count()).toBe(3);
    // outro escritorio intacto
    expect(await prisma.document.count({ where: { id: ids.docB } })).toBe(1);
  });
});
