import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// Testes de ataque: cada bloco reproduz uma falha da auditoria de seguranca e confere a correcao.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-security.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-security.db';
process.env.JWT_SECRET = 'troque-este-segredo'; // o segredo publico do .env.example: a API deve ignora-lo

let app: FastifyInstance;
let prisma: PrismaClient;
let resetLoginGuard: () => void;
const ids = { officeA: '', adminA: '', clientA: '', clientB: '', docA: '', docB: '', runA: '', uploadA: '' };
const PASS = 'senha-forte-123';

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

// cada login com um IP diferente: o limite por IP e testado a parte
let ipSeq = 0;
const freshIp = () => ({ 'cf-connecting-ip': `198.51.100.${++ipSeq % 250}` });
async function login(email: string, password = PASS) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, headers: freshIp() });
}
async function token(email: string) {
  return (await login(email)).json().accessToken as string;
}
type Cookie = { name: string; value: string; httpOnly?: boolean; sameSite?: string; path?: string };
const cookieOf = (r: { cookies: Cookie[] }) => r.cookies.find((c) => c.name === 'nay_rt');

/** ZIP minimo (deflate) para testar limites sem dependencia extra. */
function makeZip(files: { name: string; data: Buffer; fakeSize?: number }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const comp = deflateRawSync(f.data);
    const name = Buffer.from(f.name);
    const crc = crc32(f.data);
    const size = f.fakeSize ?? f.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

beforeAll(async () => {
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f);
  execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });
  ({ prisma } = await import('../src/config/db.js'));
  ({ resetLoginGuard } = await import('../src/services/login-guard.js'));
  const { buildApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const passwordHash = await bcrypt.hash(PASS, 4);

  const officeA = await prisma.office.create({ data: { name: 'Escritório A' } });
  const officeB = await prisma.office.create({ data: { name: 'Escritório B' } });
  ids.officeA = officeA.id;
  const semAuditoria = await prisma.profile.create({ data: { officeId: officeA.id, name: 'Só notas', permissions: JSON.stringify(['inicio', 'notas']) } });
  ids.adminA = (await prisma.user.create({ data: { name: 'Admin A', email: 'admin@a.test', passwordHash, role: 'ADMIN', officeId: officeA.id } })).id;
  await prisma.user.create({ data: { name: 'Leitor A', email: 'leitor@a.test', passwordHash, role: 'ANALISTA', officeId: officeA.id, profileId: semAuditoria.id } });
  await prisma.user.create({ data: { name: 'Admin B', email: 'admin@b.test', passwordHash, role: 'ADMIN', officeId: officeB.id } });
  await prisma.user.create({ data: { name: 'Vitima', email: 'vitima@a.test', passwordHash, role: 'ADMIN', officeId: officeA.id } });
  ids.clientA = (await prisma.client.create({ data: { officeId: officeA.id, name: 'Cliente A', cnpj: '11222333000181' } })).id;
  ids.clientB = (await prisma.client.create({ data: { officeId: officeB.id, name: 'Cliente B', cnpj: '22333444000190' } })).id;
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const mk = (clientId: string, key: string, emitterName: string) =>
    prisma.document.create({
      data: {
        clientId, model: '55', key, number: '1', series: '1', direction: 'entrada', issuedAt: new Date('2026-10-20T10:00:00-03:00'),
        emitterCnpj: '99888777000166', emitterName, xml: '<NFe/>', items: { create: [{ n: 1, description: evil, cfop: '5102' }] },
      },
      include: { items: true },
    });
  const dA = await mk(ids.clientA, '41000000000000000000000000000000000000000011', `=HYPERLINK("http://mal.example","clique") ${evil}`);
  ids.docA = dA.id;
  await prisma.finding.create({ data: { documentId: dA.id, itemId: dA.items[0].id, ruleCode: 'R1', field: 'cfop', kind: 'tecnica', severity: 'erro', observed: '@SUM(1+1)', expected: '+cmd|calc' } });
  ids.docB = (await mk(ids.clientB, '41000000000000000000000000000000000000000022', 'Fornecedor B')).id;
  ids.runA = (await prisma.auditRun.create({ data: { clientId: ids.clientA, status: 'CONCLUIDO' } })).id;
  ids.uploadA = (await prisma.upload.create({ data: { officeId: officeA.id, clientId: ids.clientA, fileName: 'a.xml', kind: 'XML', status: 'CONCLUIDO' } })).id;

  app = await buildApp();
  await app.ready();
}, 60_000);

beforeEach(() => resetLoginGuard());

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const f of [DB_FILE, DB_FILE + '-journal']) if (existsSync(f)) rmSync(f, { force: true });
});

describe('JWT: forja de token', () => {
  const forge = (secret: string, payload: object, alg = 'HS256') => {
    const head = b64({ alg, typ: 'JWT' });
    const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...payload });
    const sig = alg === 'none' ? '' : createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
  };

  it('token assinado com o segredo publico do .env.example e recusado', async () => {
    const t = forge('troque-este-segredo', { sub: ids.adminA, officeId: ids.officeA, role: 'ADMIN', typ: 'access', ver: 0 });
    const r = await app.inject({ method: 'GET', url: '/api/me', headers: auth(t) });
    expect(r.statusCode).toBe(401);
  });

  it('token com alg "none" e recusado', async () => {
    const t = forge('', { sub: ids.adminA, officeId: ids.officeA, role: 'ADMIN', typ: 'access', ver: 0 }, 'none');
    const r = await app.inject({ method: 'GET', url: '/api/me', headers: auth(t) });
    expect(r.statusCode).toBe(401);
  });
});

describe('login e sessao', () => {
  it('nao devolve refresh token no corpo; usa cookie httpOnly, SameSite=Strict, restrito a /api/auth', async () => {
    const r = await login('admin@a.test');
    expect(r.statusCode).toBe(200);
    expect(r.json().refreshToken).toBeUndefined();
    const c = cookieOf(r)!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');
    expect(c.path).toBe('/api/auth');
  });

  it('bloqueia o par conta+IP depois de 5 senhas erradas (forca bruta)', async () => {
    const atacante = { 'cf-connecting-ip': '203.0.113.66' };
    const tenta = (password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'vitima@a.test', password }, headers: atacante });
    for (let i = 0; i < 5; i++) expect((await tenta('errada')).statusCode).toBe(401);
    expect((await tenta(PASS)).statusCode).toBe(429); // mesmo com a senha certa, desse IP nao entra
  });

  it('o atacante nao consegue trancar a vitima que esta em outro IP', async () => {
    const r = await login('vitima@a.test'); // outro IP
    expect(r.statusCode).toBe(200);
  });

  it('limita tentativas de login por IP', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `x${i}@x.test`, password: 'x' }, headers: { 'cf-connecting-ip': '203.0.113.9' } });
      codes.push(r.statusCode);
    }
    expect(codes).toContain(429);
  });

  it('refresh pelo cookie funciona e gira o cookie; sem cookie da 401', async () => {
    const l = await login('admin@b.test');
    const r = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { nay_rt: cookieOf(l)!.value } });
    expect(r.statusCode).toBe(200);
    expect(r.json().accessToken).toBeTruthy();
    expect(cookieOf(r)?.value).toBeTruthy();
    const none = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: {} });
    expect(none.statusCode).toBe(401);
  });

  it('access token nao serve como refresh token', async () => {
    const t = await token('admin@b.test');
    const r = await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { nay_rt: t } });
    expect(r.statusCode).toBe(401);
  });

  it('"sair de todos" (e a troca de senha) derruba access e refresh tokens ja emitidos', async () => {
    const l = await login('admin@b.test');
    const access = l.json().accessToken as string;
    const rt = cookieOf(l)!.value;
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth(access) })).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout-all', headers: auth(access) });
    expect(out.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth(access) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { nay_rt: rt } })).statusCode).toBe(401);
  });
});

describe('permissoes e isolamento entre escritorios', () => {
  it('perfil sem "auditoria"/"importar" nao le rodada de auditoria nem envio', async () => {
    const t = await token('leitor@a.test');
    expect((await app.inject({ method: 'GET', url: `/api/audit/runs/${ids.runA}`, headers: auth(t) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/uploads/${ids.uploadA}`, headers: auth(t) })).statusCode).toBe(403);
  });

  it('IDOR: admin de outro escritorio recebe 404 (e nao 500) em nota, rodada e envio alheios', async () => {
    const t = await token('admin@b.test');
    for (const url of [`/api/notes/${ids.docA}`, `/api/audit/runs/${ids.runA}`, `/api/uploads/${ids.uploadA}`, `/api/notes/${ids.docA}/pdf.html`]) {
      expect((await app.inject({ method: 'GET', url, headers: auth(t) })).statusCode, url).toBe(404);
    }
    const r = await app.inject({ method: 'GET', url: `/api/notes?clientId=${ids.clientA}`, headers: auth(t) });
    expect(r.statusCode).toBe(404);
  });
});

describe('validacao de entrada', () => {
  it('clientId repetido na URL (array) da 400, nao 500', async () => {
    const t = await token('admin@a.test');
    for (const url of [`/api/dashboard?clientId=${ids.clientA}&clientId=x`, `/api/nfse/summary?clientId=${ids.clientA}&clientId=x`]) {
      expect((await app.inject({ method: 'GET', url, headers: auth(t) })).statusCode, url).toBe(400);
    }
  });

  it('nao deixa rodar duas auditorias ao mesmo tempo no mesmo cliente', async () => {
    const t = await token('admin@a.test');
    const running = await prisma.auditRun.create({ data: { clientId: ids.clientA, status: 'RODANDO' } });
    const r = await app.inject({ method: 'POST', url: '/api/audit/run', headers: auth(t), payload: { clientId: ids.clientA } });
    expect(r.statusCode).toBe(409);
    await prisma.auditRun.update({ where: { id: running.id }, data: { status: 'CONCLUIDA' } });
  });

  it('data invalida e pagina negativa dao 400, nao 500', async () => {
    const t = await token('admin@a.test');
    const bad = [
      `/api/notes?clientId=${ids.clientA}&from=2026-13-99x`,
      `/api/notes?clientId=${ids.clientA}&page=-1`,
      `/api/audit/rules?clientId=${ids.clientA}&from=ontem`,
      `/api/nfse/summary?clientId=${ids.clientA}&to=1' OR 1=1`,
    ];
    for (const url of bad) expect((await app.inject({ method: 'GET', url, headers: auth(t) })).statusCode, url).toBe(400);
  });
});

describe('injecao em arquivos gerados', () => {
  it('CSV neutraliza formulas vindas do XML', async () => {
    const t = await token('admin@a.test');
    const r = await app.inject({ method: 'GET', url: `/api/audit/export?clientId=${ids.clientA}&format=csv`, headers: auth(t) });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/(^|;)"=HYPERLINK/m);
    expect(r.body).toContain(`"'=HYPERLINK`);
    expect(r.body).toContain(`"'@SUM(1+1)"`);
    expect(r.body).toContain(`"'+cmd|calc"`);
  });

  it('HTML da nota escapa o XML e bloqueia scripts por CSP', async () => {
    const t = await token('admin@a.test');
    const r = await app.inject({ method: 'GET', url: `/api/notes/${ids.docA}/pdf.html`, headers: auth(t) });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain('<script>alert(1)</script>');
    expect(r.body).not.toContain('<img src=x');
    expect(r.body).toContain('&lt;script&gt;');
    expect(r.body).toContain(`script-src 'none'`);
  });
});

describe('importacao: XML e ZIP maliciosos', () => {
  async function upload(t: string, name: string, data: Buffer) {
    const boundary = '----nay';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientId"\r\n\r\n${ids.clientA}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...auth(t), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(r.statusCode).toBe(200);
    const id = r.json()[0].id as string;
    for (let i = 0; i < 100; i++) {
      const u = await prisma.upload.findUniqueOrThrow({ where: { id } });
      if (u.status !== 'PROCESSANDO') return u;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error('envio nao terminou');
  }

  it('XML com DOCTYPE/ENTITY (billion laughs / XXE) e recusado', async () => {
    const { parseFiscalXml } = await import('../src/xml/nfe-parser.js');
    const lol = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><nfeProc><NFe>&b;</NFe></nfeProc>';
    expect(() => parseFiscalXml(lol)).toThrow(/DOCTYPE/);
    const xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><NFe>&e;</NFe>';
    expect(() => parseFiscalXml(xxe)).toThrow(/DOCTYPE/);
  });

  it('zip bomb (taxa de compressao absurda) e recusado', async () => {
    const t = await token('admin@a.test');
    const bomb = makeZip([{ name: 'bomba.xml', data: Buffer.alloc(4 * 1024 * 1024, 0x41) }]);
    expect(bomb.length).toBeLessThan(64 * 1024);
    const u = await upload(t, 'bomba.zip', bomb);
    expect(u.status).toBe('ERRO');
    expect(u.message).toMatch(/zip bomb|limite|grande/i);
  });

  it('ZIP que mente o tamanho no cabecalho e recusado', async () => {
    const { xmlsFromZip } = await import('../src/services/ingest/zip.js');
    const lie = makeZip([{ name: 'a.xml', data: Buffer.alloc(200_000, 0x20), fakeSize: 10 }]);
    await expect(xmlsFromZip(lie)).rejects.toThrow();
  });

  it('ZIP comum continua funcionando', async () => {
    const { xmlsFromZip } = await import('../src/services/ingest/zip.js');
    const ok = makeZip([{ name: 'n1.xml', data: Buffer.from('<NFe>1</NFe>') }, { name: 'leia.txt', data: Buffer.from('x') }]);
    const out = await xmlsFromZip(ok);
    expect(out.map((o) => o.name)).toEqual(['n1.xml']);
  });
});

describe('cabecalhos HTTP', () => {
  it('envia cabecalhos de seguranca e nao libera CORS para qualquer origem', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://atacante.example' } });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('corpo JSON acima de 1 MB e recusado', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@a.test', password: 'x'.repeat(2 * 1024 * 1024) }, headers: freshIp() });
    expect(r.statusCode).toBe(413);
  });
});
