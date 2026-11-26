import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// Tela Creditos (IBS/CBS das notas de entrada por veredito) e os filtros novos da lista de notas (CFOP, modelo).
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-credits.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-credits.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let app: FastifyInstance;
let prisma: PrismaClient;
let clientId = '';
let otherClientId = '';
let token = '';
let semCreditos = '';
const auth = () => ({ authorization: `Bearer ${token}` });
const get = (url: string, t = token) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${t}` } });

let seq = 0;
async function nota(data: { direction?: string; verdict: string; status?: string; emitter: [string, string]; issuedAt: string; vIbs: number; vCbs: number; cfop?: string; model?: string; total?: number; clientId?: string }) {
  seq += 1;
  return prisma.document.create({
    data: {
      clientId: data.clientId ?? clientId, model: data.model ?? '55', key: String(seq).padStart(44, '0'), number: String(seq), series: '1',
      direction: data.direction ?? 'entrada', issuedAt: new Date(data.issuedAt), emitterCnpj: data.emitter[0], emitterName: data.emitter[1], xml: '<NFe/>',
      status: data.status ?? 'ok', verdict: data.verdict, total: BigInt(Math.round((data.total ?? 100) * 100)),
      vIbs: BigInt(Math.round(data.vIbs * 100)), vCbs: BigInt(Math.round(data.vCbs * 100)),
      items: { create: [{ n: 1, description: 'Item', cfop: data.cfop ?? '1102' }] },
    },
  });
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash('senha123', 4);

  const office = await prisma.office.create({ data: { name: 'Escritório' } });
  const outro = await prisma.office.create({ data: { name: 'Outro' } });
  await prisma.user.create({ data: { name: 'Admin', email: 'admin@a.test', passwordHash, role: 'ADMIN', officeId: office.id } });
  const semPerm = await prisma.profile.create({ data: { officeId: office.id, name: 'Só início', permissions: JSON.stringify(['inicio']) } });
  await prisma.user.create({ data: { name: 'Sem', email: 'sem@a.test', passwordHash, role: 'ANALISTA', officeId: office.id, profileId: semPerm.id } });
  clientId = (await prisma.client.create({ data: { officeId: office.id, name: 'Cliente', cnpj: '00000000000101' } })).id;
  otherClientId = (await prisma.client.create({ data: { officeId: outro.id, name: 'De outro', cnpj: '00000000000202' } })).id;

  const ACO: [string, string] = ['11111111000111', 'Aço Brasil'];
  const ESPUMA: [string, string] = ['22222222000122', 'Espumas Nordeste'];
  await nota({ verdict: 'pode_creditar', emitter: ACO, issuedAt: '2026-10-05T12:00:00-03:00', vIbs: 10, vCbs: 40, cfop: '1102', total: 500 });
  await nota({ verdict: 'pode_creditar', emitter: ACO, issuedAt: '2026-10-20T12:00:00-03:00', vIbs: 5, vCbs: 20, cfop: '1102', total: 300 });
  await nota({ verdict: 'credito_em_risco', status: 'erro', emitter: ESPUMA, issuedAt: '2026-09-15T12:00:00-03:00', vIbs: 7, vCbs: 33, cfop: '2102', total: 900 });
  await nota({ verdict: 'nao_creditar', status: 'cancelada', emitter: ESPUMA, issuedAt: '2026-10-02T12:00:00-03:00', vIbs: 1, vCbs: 2, cfop: '2102', model: '57', total: 100 });
  await nota({ verdict: '', status: 'pendente', emitter: ACO, issuedAt: '2026-10-03T12:00:00-03:00', vIbs: 99, vCbs: 99 }); // ainda sem auditoria
  // saida e nota de outro cliente nao entram nos creditos
  await nota({ direction: 'saida', verdict: 'correta', emitter: ACO, issuedAt: '2026-10-04T12:00:00-03:00', vIbs: 500, vCbs: 500, cfop: '5102' });
  await nota({ clientId: otherClientId, verdict: 'pode_creditar', emitter: ACO, issuedAt: '2026-10-04T12:00:00-03:00', vIbs: 700, vCbs: 700 });
  semCreditos = (await prisma.client.create({ data: { officeId: office.id, name: 'Vazio', cnpj: '00000000000303' } })).id;

  app = await buildApp();
  await app.ready();
  token = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@a.test', password: 'senha123' } })).json().accessToken;
}, 90_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
});

describe('GET /api/credits', () => {
  it('soma IBS+CBS das notas de entrada por veredito e conta as que faltam auditar', async () => {
    const r = await get(`/api/credits?clientId=${clientId}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ totals: { pode: 75, risco: 40, nao: 3 }, notAudited: 1, group: 'forn' });
  });

  it('por fornecedor: valores, notas por veredito e ordem do maior para o menor', async () => {
    const { rows } = (await get(`/api/credits?clientId=${clientId}`)).json();
    expect(rows).toEqual([
      { key: '11111111000111', label: 'Aço Brasil', notes: 2, ibs: 15, cbs: 60, pode: 2, risco: 0, nao: 0 },
      { key: '22222222000122', label: 'Espumas Nordeste', notes: 2, ibs: 8, cbs: 35, pode: 0, risco: 1, nao: 1 },
    ]);
  });

  it('por mês: do mais recente para o mais antigo, e o período limita', async () => {
    const mes = (await get(`/api/credits?clientId=${clientId}&group=mes`)).json();
    expect(mes.rows.map((r: { key: string }) => r.key)).toEqual(['2026-10', '2026-09']);
    expect(mes.rows[0]).toMatchObject({ notes: 3, ibs: 16, cbs: 62, pode: 2, nao: 1 });
    expect(mes.rows[1]).toMatchObject({ notes: 1, ibs: 7, cbs: 33, risco: 1 });

    const so = (await get(`/api/credits?clientId=${clientId}&from=2026-10-01&to=2026-10-31`)).json();
    expect(so.totals).toEqual({ pode: 75, risco: 0, nao: 3 });
  });

  it('cliente sem notas devolve zeros; cliente de outro escritório é 404; grupo ou data inválidos são 400', async () => {
    expect((await get(`/api/credits?clientId=${semCreditos}`)).json()).toMatchObject({ totals: { pode: 0, risco: 0, nao: 0 }, rows: [], notAudited: 0 });
    expect((await get(`/api/credits?clientId=${otherClientId}`)).statusCode).toBe(404);
    expect((await get(`/api/credits?clientId=${clientId}&group=ano`)).statusCode).toBe(400);
    expect((await get(`/api/credits?clientId=${clientId}&from=ontem`)).statusCode).toBe(400);
  });

  it('exige a tela Créditos no perfil', async () => {
    const sem = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'sem@a.test', password: 'senha123' } })).json().accessToken;
    expect((await get(`/api/credits?clientId=${clientId}`, sem)).statusCode).toBe(403);
  });
});

describe('lista de notas: CFOP e modelo', () => {
  const numeros = async (qs: string) => ((await get(`/api/notes?clientId=${clientId}&size=50&${qs}`)).json().rows as { cfop: string; model: string }[]);

  it('filtra por CFOP de algum item', async () => {
    const rows = await numeros('cfop=2102');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.cfop === '2102')).toBe(true);
  });

  it('filtra por modelo e combina com o CFOP', async () => {
    expect(await numeros('model=57')).toHaveLength(1);
    expect(await numeros('model=57&cfop=1102')).toHaveLength(0);
  });

  it('CFOP que não tem 4 dígitos é 400', async () => {
    expect((await get(`/api/notes?clientId=${clientId}&cfop=21`)).statusCode).toBe(400);
    expect((await get(`/api/notes?clientId=${clientId}&cfop=21a2`)).statusCode).toBe(400);
  });
});

void auth;
