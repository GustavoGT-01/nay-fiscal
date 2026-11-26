import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// Gestao de usuarios e perfis: criar, editar, trocar senha e isolamento entre escritorios.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-team.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-team.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let app: FastifyInstance;
let prisma: PrismaClient;
const ids = { officeA: '', officeB: '', profileA: '', profileB: '', adminA: '', analistaA: '' };
const SENHA = 'senha-boa-123';

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
let ipSeq = 0;
async function login(email: string, password = SENHA) {
  // cada login com um IP proprio: o limite de 10 logins por minuto por IP nao deve atrapalhar a sequencia do teste
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: `10.0.0.${++ipSeq}` });
  return { status: r.statusCode, token: (r.json().accessToken ?? '') as string };
}
const call = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

let adminToken = '';
let analistaToken = '';
let adminBToken = '';

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash(SENHA, 4);

  ids.officeA = (await prisma.office.create({ data: { name: 'Escritório A' } })).id;
  ids.officeB = (await prisma.office.create({ data: { name: 'Escritório B' } })).id;
  // o analista enxerga a Gestao (so le): mesmo assim nao pode criar nem alterar
  ids.profileA = (await prisma.profile.create({ data: { officeId: ids.officeA, name: 'Analista', permissions: JSON.stringify(['inicio', 'gestao']) } })).id;
  ids.profileB = (await prisma.profile.create({ data: { officeId: ids.officeB, name: 'Do B', permissions: JSON.stringify(['inicio']) } })).id;
  ids.adminA = (await prisma.user.create({ data: { name: 'Admin A', email: 'admin@a.test', passwordHash, role: 'ADMIN', officeId: ids.officeA } })).id;
  ids.analistaA = (await prisma.user.create({ data: { name: 'Analista A', email: 'analista@a.test', passwordHash, role: 'ANALISTA', officeId: ids.officeA, profileId: ids.profileA } })).id;
  await prisma.user.create({ data: { name: 'Admin B', email: 'admin@b.test', passwordHash, role: 'ADMIN', officeId: ids.officeB } });

  app = await buildApp();
  await app.ready();
  adminToken = (await login('admin@a.test')).token;
  analistaToken = (await login('analista@a.test')).token;
  adminBToken = (await login('admin@b.test')).token;
}, 90_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
});

describe('quem pode criar e alterar', () => {
  it('analista com a tela Gestão lê usuários e perfis, mas não cria nem altera', async () => {
    expect((await call(analistaToken, 'GET', '/api/admin/users')).statusCode).toBe(200);
    expect((await call(analistaToken, 'GET', '/api/admin/profiles')).statusCode).toBe(200);
    const novo = { name: 'X', email: 'x@a.test', password: 'senha-boa-123', role: 'ADMIN' };
    expect((await call(analistaToken, 'POST', '/api/admin/users', novo)).statusCode).toBe(403);
    expect((await call(analistaToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { role: 'ADMIN' })).statusCode).toBe(403);
    expect((await call(analistaToken, 'PUT', `/api/admin/profiles/${ids.profileA}`, { name: 'Analista', permissions: ['inicio', 'gestao', 'dados.apagar'] })).statusCode).toBe(403);
    // e o perfil continua como estava: nao deu para se promover
    expect(JSON.parse((await prisma.profile.findUniqueOrThrow({ where: { id: ids.profileA } })).permissions)).toEqual(['inicio', 'gestao']);
  });
});

describe('usuários', () => {
  it('cria com senha provisória, recusa senha fraca, e-mail repetido e perfil de outro escritório', async () => {
    const base = { name: 'Carlos', email: 'Carlos@A.test', password: 'provisoria-123', role: 'ANALISTA', profileId: ids.profileA };
    expect((await call(adminToken, 'POST', '/api/admin/users', { ...base, password: 'curta1' })).statusCode).toBe(400);
    expect((await call(adminToken, 'POST', '/api/admin/users', { ...base, password: 'soletrasaqui' })).statusCode).toBe(400);
    expect((await call(adminToken, 'POST', '/api/admin/users', { ...base, profileId: ids.profileB })).statusCode).toBe(400);
    expect((await call(adminToken, 'POST', '/api/admin/users', { ...base, profileId: null })).statusCode).toBe(400);

    const ok = await call(adminToken, 'POST', '/api/admin/users', base);
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ email: 'carlos@a.test', role: 'ANALISTA', profile: 'Analista', active: true, mustChangePassword: true });
    expect(ok.json()).not.toHaveProperty('passwordHash');

    const dup = await call(adminToken, 'POST', '/api/admin/users', base);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toContain('e-mail');
  });

  it('primeiro acesso: troca a senha, as sessões antigas caem e a nova segue valendo', async () => {
    const primeiro = await login('carlos@a.test', 'provisoria-123');
    expect(primeiro.status).toBe(200);
    const me = await call(primeiro.token, 'GET', '/api/me');
    expect(me.json().mustChangePassword).toBe(true);

    expect((await call(primeiro.token, 'POST', '/api/auth/change-password', { current: 'errada-123456', next: 'nova-senha-456' })).statusCode).toBe(400);
    expect((await call(primeiro.token, 'POST', '/api/auth/change-password', { current: 'provisoria-123', next: 'fraca1' })).statusCode).toBe(400);
    expect((await call(primeiro.token, 'POST', '/api/auth/change-password', { current: 'provisoria-123', next: 'provisoria-123' })).statusCode).toBe(400);

    const troca = await call(primeiro.token, 'POST', '/api/auth/change-password', { current: 'provisoria-123', next: 'nova-senha-456' });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().user.mustChangePassword).toBe(false);
    expect((await call(primeiro.token, 'GET', '/api/me')).statusCode).toBe(401); // o token antigo caiu
    expect((await call(troca.json().accessToken, 'GET', '/api/me')).statusCode).toBe(200); // o novo vale
    expect((await login('carlos@a.test', 'provisoria-123')).status).toBe(401);
    expect((await login('carlos@a.test', 'nova-senha-456')).status).toBe(200);
  });

  it('administrador redefine a senha de outro e derruba as sessões dele; a própria conta não se redefine por aqui', async () => {
    const sessao = (await login('carlos@a.test', 'nova-senha-456')).token;
    const carlos = (await prisma.user.findUniqueOrThrow({ where: { email: 'carlos@a.test' } })).id;
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${carlos}`, { password: 'redefinida-789' })).statusCode).toBe(200);
    expect((await call(sessao, 'GET', '/api/me')).statusCode).toBe(401);
    expect((await call((await login('carlos@a.test', 'redefinida-789')).token, 'GET', '/api/me')).json().mustChangePassword).toBe(true);
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.adminA}`, { password: 'outra-senha-123' })).statusCode).toBe(400);
  });

  it('não desativa nem rebaixa a si mesmo; desativar outro encerra o acesso dele', async () => {
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.adminA}`, { active: false })).statusCode).toBe(400);
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.adminA}`, { role: 'ANALISTA', profileId: ids.profileA })).statusCode).toBe(400);

    const sessao = (await login('analista@a.test')).token;
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { active: false })).statusCode).toBe(200);
    expect((await call(sessao, 'GET', '/api/me')).statusCode).toBe(401);
    expect((await login('analista@a.test')).status).toBe(401);
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { active: true })).statusCode).toBe(200);
    analistaToken = (await login('analista@a.test')).token;
  });

  it('promover a administrador tira o perfil; analista exige perfil', async () => {
    const r = await call(adminToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { role: 'ADMIN' });
    expect(r.json()).toMatchObject({ role: 'ADMIN', profileId: null, profile: null });
    const volta = await call(adminToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { role: 'ANALISTA' });
    expect(volta.statusCode).toBe(400); // sem perfil
    expect((await call(adminToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { role: 'ANALISTA', profileId: ids.profileA })).statusCode).toBe(200);
  });

  it('outro escritório não vê nem altera os usuários', async () => {
    expect((await call(adminBToken, 'PATCH', `/api/admin/users/${ids.analistaA}`, { name: 'Invadido' })).statusCode).toBe(404);
    const lista = (await call(adminBToken, 'GET', '/api/admin/users')).json() as { email: string }[];
    expect(lista.map((u) => u.email)).toEqual(['admin@b.test']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.analistaA } })).name).toBe('Analista A');
  });
});

describe('perfis', () => {
  it('cria, recusa permissão desconhecida e nome repetido, e a mudança vale na hora para quem usa o perfil', async () => {
    expect((await call(adminToken, 'POST', '/api/admin/profiles', { name: 'Novo', permissions: ['inicio', 'voar'] })).statusCode).toBe(400);
    const criado = await call(adminToken, 'POST', '/api/admin/profiles', { name: 'Conferente', permissions: ['inicio', 'notas', 'notas', 'auditoria.rodar'] });
    expect(criado.statusCode).toBe(201);
    expect(criado.json()).toMatchObject({ name: 'Conferente', permissions: ['inicio', 'notas', 'auditoria.rodar'], users: 0 });
    expect((await call(adminToken, 'POST', '/api/admin/profiles', { name: 'conferente', permissions: [] })).statusCode).toBe(409);

    // o analista passa a ter 'notas' sem precisar entrar de novo (o login e so porque os testes acima mudaram o papel dele)
    analistaToken = (await login('analista@a.test')).token;
    expect((await call(analistaToken, 'GET', '/api/notes?clientId=x')).statusCode).toBe(403);
    expect((await call(adminToken, 'PUT', `/api/admin/profiles/${ids.profileA}`, { name: 'Analista', permissions: ['inicio', 'gestao', 'notas'] })).statusCode).toBe(200);
    expect((await call(analistaToken, 'GET', '/api/me')).json().permissions).toContain('notas');
  });

  it('apagar: recusa quando há usuários e apaga o perfil vazio; perfil de outro escritório é 404', async () => {
    expect((await call(adminToken, 'DELETE', `/api/admin/profiles/${ids.profileA}`)).statusCode).toBe(409);
    expect((await call(adminToken, 'PUT', `/api/admin/profiles/${ids.profileB}`, { name: 'Do B', permissions: [] })).statusCode).toBe(404);
    expect((await call(adminToken, 'DELETE', `/api/admin/profiles/${ids.profileB}`)).statusCode).toBe(404);
    const vazio = ((await call(adminToken, 'GET', '/api/admin/profiles')).json() as { id: string; name: string }[]).find((p) => p.name === 'Conferente')!;
    expect((await call(adminToken, 'DELETE', `/api/admin/profiles/${vazio.id}`)).statusCode).toBe(200);
  });
});
