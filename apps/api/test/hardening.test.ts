import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildNfe, cnpjFrom, type BuildItem } from '../prisma/demo/nfe-builder.js';
import { multipart } from './helpers/zip.js';

// Seguranca residual (fase 6): nota autorizada nao e sobrescrita, rotacao de sessao com deteccao de reuso,
// bloqueio de login guardado no banco, senha provisoria e dados reduzidos por perfil.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-hardening.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-hardening.db';
process.env.JWT_SECRET = 'segredo-de-teste';

let app: FastifyInstance;
let prisma: PrismaClient;
let processUpload: (id: string, files: { name: string; xml: string }[]) => Promise<void>;
const ids = { office: '', client: '', admin: '' };

const SENHA = 'senha-boa-123';
const EMPRESA = cnpjFrom('556677880001');
const FORN = cnpjFrom('112233440001');
const MGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };
const item: BuildItem = { code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100, icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true } };
let n = 700;
const nota = () =>
  buildNfe({
    uf: '41', issuedAt: new Date('2026-10-20T10:00:00-03:00'), number: n++, natOp: 'VENDA',
    emitter: { cnpj: FORN, name: 'Fornecedor', ...MGA, crt: '3' },
    recipient: { cnpj: EMPRESA, name: 'Empresa', ...MGA },
    items: [item],
  });
/** Mesma chave e mesmo protocolo, com o valor trocado: a nota forjada. */
const forjar = (xml: string) => xml.replace(/<vNF>[^<]*<\/vNF>/, '<vNF>99999.00</vNF>');
const semProtocolo = (xml: string) => xml.replace(/<protNFe[\s\S]*<\/protNFe>/, '');
const eventoCancelamento = (key: string) => `<procEventoNFe><evento><infEvento><chNFe>${key}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;

async function enviar(files: { name: string; xml: string }[]) {
  const up = await prisma.upload.create({ data: { officeId: ids.office, userId: ids.admin, clientId: ids.client, fileName: 'lote.zip', kind: 'ZIP' } });
  await processUpload(up.id, files);
  return prisma.upload.findUniqueOrThrow({ where: { id: up.id } });
}
const guardada = (key: string) => prisma.document.findFirstOrThrow({ where: { clientId: ids.client, key } });
const historico = (key: string) => prisma.documentEvent.findMany({ where: { key }, orderBy: { createdAt: 'asc' } });

let ip = 0;
type Cookie = { name: string; value: string };
const cookieOf = (r: { cookies: Cookie[] }) => r.cookies.find((c) => c.name === 'nay_rt')?.value ?? '';
const login = (email: string, password = SENHA) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: `10.1.0.${++ip}` });
const refresh = (cookie: string) => app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { nay_rt: cookie } });
const get = (url: string, token: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
const jtiDe = (cookie: string) => (JSON.parse(Buffer.from(cookie.split('.')[1]!, 'base64url').toString()) as { jti: string }).jti;
/** Finge que o token foi gasto ha um minuto (fora da tolerancia de duas abas). */
const envelhecerUso = (cookie: string) => prisma.refreshToken.update({ where: { jti: jtiDe(cookie) }, data: { usedAt: new Date(Date.now() - 60_000) } });

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  ({ processUpload } = await import('../src/services/ingest/process-upload.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash(SENHA, 4);

  ids.office = (await prisma.office.create({ data: { name: 'Escritório' } })).id;
  ids.admin = (await prisma.user.create({ data: { name: 'Nayara', email: 'admin@a.test', passwordHash, role: 'ADMIN', officeId: ids.office } })).id;
  const soNotas = await prisma.profile.create({ data: { officeId: ids.office, name: 'Só notas', permissions: JSON.stringify(['inicio', 'notas']) } });
  const soInicio = await prisma.profile.create({ data: { officeId: ids.office, name: 'Só início', permissions: JSON.stringify(['inicio']) } });
  await prisma.user.create({ data: { name: 'Notas', email: 'notas@a.test', passwordHash, role: 'ANALISTA', officeId: ids.office, profileId: soNotas.id } });
  await prisma.user.create({ data: { name: 'Inicio', email: 'inicio@a.test', passwordHash, role: 'ANALISTA', officeId: ids.office, profileId: soInicio.id } });
  await prisma.user.create({ data: { name: 'Novo', email: 'novo@a.test', passwordHash, role: 'ADMIN', officeId: ids.office, mustChangePassword: true } });
  ids.client = (await prisma.client.create({ data: { officeId: ids.office, name: 'Empresa', cnpj: EMPRESA, ...MGA, cnae: '4711301', establishments: { create: [{ cnpj: EMPRESA, label: 'Matriz', isMatriz: true }] } } })).id;

  app = await buildApp();
  await app.ready();
}, 90_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f, { force: true });
});

describe('6.1 nota autorizada não é sobrescrita', () => {
  it('reimportar o mesmo XML (mesmo com outra formatação) atualiza sem registrar mudança', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    const u = await enviar([{ name: 'a.xml', xml: a.xml.replace(/></g, '>\n  <') }]);
    expect(u.message).toBeNull();
    expect(await historico(a.key)).toEqual([]);
  });

  it('XML com a mesma chave e outro conteúdo é recusado, registrado com quem enviou e avisado', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    const antes = await guardada(a.key);
    const u = await enviar([{ name: 'forjada.xml', xml: forjar(a.xml) }]);

    const depois = await guardada(a.key);
    expect(depois.total).toBe(antes.total);
    expect(depois.xml).toBe(antes.xml);
    expect(u.message).toContain('1 nota(s) recusada(s)');
    expect(u.message).toContain('forjada.xml');
    expect(await historico(a.key)).toMatchObject([{ type: 'recusada', userId: ids.admin, userName: 'Nayara', uploadId: u.id, officeId: ids.office }]);
    const aviso = await prisma.notification.findFirstOrThrow({ where: { type: 'NOTAS_ALTERADAS' }, orderBy: { createdAt: 'desc' } });
    expect(aviso).toMatchObject({ severity: 'WARN', title: 'Nota recusada na importação' });
    expect(aviso.message).toContain('Nayara enviou lote.zip: 1 recusada(s)');
  });

  it('mesmo conteúdo com outro protocolo é recusado', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    await enviar([{ name: 'b.xml', xml: a.xml.replace(/<nProt>[^<]*<\/nProt>/, '<nProt>999999999999999</nProt>') }]);
    expect((await guardada(a.key)).protocol).not.toBe('999999999999999');
    expect(await historico(a.key)).toMatchObject([{ type: 'recusada' }]);
  });

  it('o mesmo XML sem o protocolo não rebaixa a nota autorizada', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    const u = await enviar([{ name: 'sem-protocolo.xml', xml: semProtocolo(a.xml) }]);
    expect((await guardada(a.key)).protocol).toBeTruthy();
    expect(u.message).toContain('1 nota(s) mantida(s)');
    expect(await historico(a.key)).toEqual([]);
  });

  it('nota sem protocolo pode ser substituída, e a troca fica registrada', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: semProtocolo(a.xml) }]);
    await enviar([{ name: 'b.xml', xml: forjar(semProtocolo(a.xml)) }]);
    expect(Number((await guardada(a.key)).total)).toBe(9_999_900);
    expect(await historico(a.key)).toMatchObject([{ type: 'substituida', userName: 'Nayara' }]);
  });

  it('cancelamento é registrado uma vez, e reimportar a nota autorizada não a descancela', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    await enviar([{ name: 'cancela.xml', xml: eventoCancelamento(a.key) }]);
    await enviar([{ name: 'cancela.xml', xml: eventoCancelamento(a.key) }]);
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    expect(await guardada(a.key)).toMatchObject({ cancelled: true, status: 'cancelada' });
    expect(await historico(a.key)).toMatchObject([{ type: 'cancelada', userName: 'Nayara' }]);
  });

  it('para trocar de propósito: apagar a nota e importar de novo; o histórico sobrevive', async () => {
    const a = nota();
    await enviar([{ name: 'a.xml', xml: a.xml }]);
    await enviar([{ name: 'b.xml', xml: forjar(a.xml) }]);
    await prisma.document.delete({ where: { id: (await guardada(a.key)).id } });
    await enviar([{ name: 'b.xml', xml: forjar(a.xml) }]);
    expect(Number((await guardada(a.key)).total)).toBe(9_999_900);
    expect(await historico(a.key)).toHaveLength(1);
  });

  it('o envio pela rota guarda quem enviou', async () => {
    const token = (await login('admin@a.test')).json().accessToken as string;
    const m = await multipart([{ name: 'rota.xml', data: Buffer.from(nota().xml) }], { clientId: ids.client });
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { authorization: `Bearer ${token}`, ...m.headers }, payload: m.payload });
    const id = (r.json() as { id: string }[])[0]!.id;
    expect((await prisma.upload.findUniqueOrThrow({ where: { id } })).userId).toBe(ids.admin);
    // espera a fila terminar antes de o teste fechar o banco
    for (let i = 0; i < 100 && (await prisma.upload.findUniqueOrThrow({ where: { id } })).status === 'PROCESSANDO'; i++) await new Promise((ok) => setTimeout(ok, 50));
  });
});

describe('6.2 sessão: rotação com detecção de reuso', () => {
  it('token já gasto que reaparece derruba a sessão inteira', async () => {
    const c1 = cookieOf(await login('admin@a.test'));
    const r2 = await refresh(c1);
    expect(r2.statusCode).toBe(200);
    const c2 = cookieOf(r2);
    await envelhecerUso(c1);
    expect((await refresh(c1)).statusCode).toBe(401); // a copia
    expect((await refresh(c2)).statusCode).toBe(401); // e o token legitimo da mesma sessao
  });

  it('outra sessão da mesma pessoa não cai junto', async () => {
    const celular = cookieOf(await login('admin@a.test'));
    const c1 = cookieOf(await login('admin@a.test'));
    await refresh(c1);
    await envelhecerUso(c1);
    await refresh(c1);
    expect((await refresh(celular)).statusCode).toBe(200);
  });

  it('duas abas renovando juntas (poucos segundos) continuam logadas', async () => {
    const c1 = cookieOf(await login('admin@a.test'));
    const [a, b] = await Promise.all([refresh(c1), refresh(c1)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect((await refresh(cookieOf(a))).statusCode).toBe(200);
  });

  it('"Sair" revoga a sessão: uma cópia do cookie deixa de valer', async () => {
    const c = cookieOf(await login('admin@a.test'));
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { nay_rt: c } })).statusCode).toBe(200);
    expect((await refresh(c)).statusCode).toBe(401);
  });

  it('token de renovação sem identificador (formato antigo) é recusado', async () => {
    const antigo = app.jwt.sign({ sub: ids.admin, officeId: ids.office, role: 'ADMIN', typ: 'refresh', ver: 0 }, { expiresIn: 600 });
    expect((await refresh(antigo)).statusCode).toBe(401);
  });

  it('"sair de todos" apaga as sessões guardadas', async () => {
    const r = await login('admin@a.test');
    await app.inject({ method: 'POST', url: '/api/auth/logout-all', headers: { authorization: `Bearer ${r.json().accessToken}` } });
    expect(await prisma.refreshToken.count({ where: { userId: ids.admin } })).toBe(0);
    expect((await refresh(cookieOf(r))).statusCode).toBe(401);
  });
});

describe('6.4 bloqueio de login guardado no banco', () => {
  let guard: typeof import('../src/services/login-guard.js');
  beforeAll(async () => { guard = await import('../src/services/login-guard.js'); });
  beforeEach(() => guard.resetLoginGuard());

  it('bloqueia na quinta falha e não grava o que foi digitado', async () => {
    const chave = 'minha-senha-digitada-no-lugar-errado|10.0.0.1';
    for (let i = 0; i < 4; i++) await guard.registerFailure(chave);
    expect(await guard.lockRemaining(chave)).toBe(0);
    await guard.registerFailure(chave);
    expect(await guard.lockRemaining(chave)).toBeGreaterThan(0);
    const linhas = await prisma.loginAttempt.findMany();
    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas)).not.toContain('senha-digitada');
  });

  it('a janela vence: falhas antigas não somam, e entradas velhas são apagadas', async () => {
    const t0 = Date.now() - 60 * 60_000;
    for (let i = 0; i < 4; i++) await guard.registerFailure('a|1', t0);
    await guard.registerFailure('b|2');
    expect(await prisma.loginAttempt.count()).toBe(1);
    await guard.registerFailure('a|1');
    expect(await guard.lockRemaining('a|1')).toBe(0);
  });

  it('acertar a senha zera a contagem', async () => {
    for (let i = 0; i < 4; i++) await guard.registerFailure('c|3');
    await guard.registerSuccess('c|3');
    await guard.registerFailure('c|3');
    expect(await guard.lockRemaining('c|3')).toBe(0);
  });
});

describe('senha provisória bloqueia a API até a troca', () => {
  it('só deixa saber quem é, trocar a senha e sair', async () => {
    const t = (await login('novo@a.test')).json().accessToken as string;
    expect((await get('/api/me', t)).statusCode).toBe(200);
    for (const url of ['/api/clients', '/api/notifications', `/api/notes?clientId=${ids.client}`, '/api/admin/users']) {
      const r = await get(url, t);
      expect(r.statusCode, url).toBe(403);
      expect(r.json().code, url).toBe('TROCAR_SENHA');
    }
    const troca = await app.inject({ method: 'POST', url: '/api/auth/change-password', headers: { authorization: `Bearer ${t}` }, payload: { current: SENHA, next: 'minha-senha-456' } });
    expect(troca.statusCode).toBe(200);
    expect((await get('/api/clients', troca.json().accessToken)).statusCode).toBe(200);
  });
});

describe('6.3 dados reduzidos por perfil', () => {
  it('quem não tem Clientes recebe a lista para escolher, sem CNPJ, CNAE nem filiais', async () => {
    const t = (await login('notas@a.test')).json().accessToken as string;
    const [c] = (await get('/api/clients', t)).json() as Record<string, unknown>[];
    expect(c).toMatchObject({ id: ids.client, name: 'Empresa', cnpj: '', cnae: null, cityCode: null, establishments: [] });
  });

  it('quem tem acesso total recebe os dados completos', async () => {
    const t = (await login('notas@a.test')).json().accessToken as string;
    expect(t).toBeTruthy();
    const bcrypt = (await import('bcryptjs')).default;
    await prisma.user.create({ data: { name: 'Outro', email: 'outro@a.test', passwordHash: await bcrypt.hash(SENHA, 4), role: 'ADMIN', officeId: ids.office } });
    const admin = (await login('outro@a.test')).json().accessToken as string;
    const [c] = (await get('/api/clients', admin)).json() as Record<string, unknown>[];
    expect(c).toMatchObject({ cnpj: EMPRESA, cnae: '4711301' });
    expect(c!.establishments).toHaveLength(1);
  });

  it('avisos que citam notas e clientes só chegam a quem alcança a tela', async () => {
    await prisma.notification.createMany({
      data: [
        { officeId: ids.office, type: 'CLIENT_DELETED', title: 'Cliente excluído', message: 'x', severity: 'INFO' },
        { officeId: ids.office, type: 'AVISO_GERAL', title: 'Geral', message: 'y', severity: 'INFO' },
      ],
    });
    const tipos = async (email: string) => {
      const t = (await login(email)).json().accessToken as string;
      return [...new Set(((await get('/api/notifications', t)).json() as { type: string }[]).map((x) => x.type))].sort();
    };
    expect(await tipos('inicio@a.test')).toEqual(['AVISO_GERAL']);
    expect(await tipos('notas@a.test')).toEqual(['AVISO_GERAL', 'NOTAS_ALTERADAS']);
    expect(await tipos('outro@a.test')).toEqual(['AVISO_GERAL', 'CLIENT_DELETED', 'NOTAS_ALTERADAS']);
  });
});
