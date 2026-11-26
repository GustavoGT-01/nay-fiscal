import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeZip } from './helpers/zip.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

// Testes de ataque: cada bloco reproduz uma falha da auditoria de seguranca e confere a correcao.
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('../prisma/test-security.db', import.meta.url));
process.env.DATABASE_URL = 'file:./test-security.db';
process.env.JWT_SECRET = 'troque-este-segredo'; // o segredo publico do .env.example: a API deve ignora-lo
process.env.TRUST_CF_IP = '1'; // os testes simulam IPs diferentes pelo cabecalho do tunel

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
  }, 20_000); // 14 logins em serie, cada um com bcrypt de custo 12: passa de 5 s com a maquina carregada

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

  it('perfil com permissoes corrompidas entra sem nenhuma permissao, em vez de dar "sessao expirou"', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const profile = await prisma.profile.create({ data: { officeId: ids.officeA, name: 'Quebrado', permissions: 'isto nao e json{' } });
    await prisma.user.create({ data: { name: 'Q', email: 'quebrado@a.test', passwordHash: await bcrypt.hash(PASS, 4), role: 'ANALISTA', officeId: ids.officeA, profileId: profile.id } });
    const t = await token('quebrado@a.test');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(t) });
    expect(me.statusCode).toBe(200);
    expect(me.json().permissions).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/api/notes?clientId=${ids.clientA}`, headers: auth(t) })).statusCode).toBe(403);
  });

  it('CF-Connecting-IP so vale com o tunel ligado ou TRUST_CF_IP, nao so por NODE_ENV=test', async () => {
    const { clientIp } = await import('../src/services/client-ip.js');
    const req = { headers: { 'cf-connecting-ip': '198.51.100.7' }, ip: '127.0.0.1' } as never;
    const before = { f: process.env.TRUST_CF_IP, s: process.env.SERVE_WEB };
    try {
      delete process.env.TRUST_CF_IP;
      delete process.env.SERVE_WEB;
      expect(process.env.NODE_ENV === 'test' || process.env.VITEST === 'true').toBe(true); // o atalho antigo estaria ligado
      expect(clientIp(req)).toBe('127.0.0.1');
      process.env.TRUST_CF_IP = '1';
      expect(clientIp(req)).toBe('198.51.100.7');
    } finally {
      if (before.f === undefined) delete process.env.TRUST_CF_IP; else process.env.TRUST_CF_IP = before.f;
      if (before.s === undefined) delete process.env.SERVE_WEB; else process.env.SERVE_WEB = before.s;
    }
  });

  it('parametros de URL fora da lista dao 400 em todas as rotas, e os validos continuam passando', async () => {
    const t = await token('admin@a.test');
    const c = `clientId=${ids.clientA}`;
    const get = async (url: string) => (await app.inject({ method: 'GET', url, headers: auth(t) })).statusCode;
    const invalidos = [
      `/api/dashboard?${c}&direction=lateral`,
      `/api/audit/rules?${c}&direction=lateral`,
      `/api/audit/suppliers?${c}&direction=x`,
      `/api/nfse/summary?${c}&direction=x`,
      `/api/audit/export?${c}&format=pdf`,
      `/api/audit/export?${c}&from=ontem`,
      `/api/notes?${c}&status=qualquer`,
      `/api/notes?${c}&verdict=talvez`,
      `/api/notes?${c}&model=99`,
      `/api/notes?${c}&supplier=${'9'.repeat(40)}`,
    ];
    for (const url of invalidos) expect(await get(url), url).toBe(400);
    // id gigante no caminho: o Fastify recusa antes do zod (414); em qualquer caso nunca chega ao banco
    for (const base of ['/api/notes/', '/api/uploads/', '/api/audit/runs/']) expect([400, 414], base).toContain(await get(base + 'x'.repeat(200)));
    const validos = [
      `/api/dashboard?${c}&direction=entrada`,
      `/api/audit/rules?${c}&direction=all&from=2026-01-01&to=2026-12-31`,
      `/api/audit/suppliers?${c}&direction=saida`,
      `/api/nfse/summary?${c}&direction=all`,
      `/api/audit/export?${c}&format=csv`,
      `/api/audit/export?${c}`, // sem format: xlsx por padrao
      `/api/notes?${c}&status=problemas&verdict=correta&model=NFSE&direction=all`,
      `/api/notes?${c}&status=all`,
    ];
    for (const url of validos) expect(await get(url), url).toBe(200);
  });

  it('duas auditorias disparadas no mesmo instante: so uma entra', async () => {
    const { runClientAudit } = await import('../src/services/audit.js');
    const c = await prisma.client.create({ data: { officeId: ids.officeA, name: 'Sem notas', cnpj: '33444555000172' } });
    const r = await Promise.allSettled([runClientAudit(c.id), runClientAudit(c.id)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as { statusCode?: number }).statusCode).toBe(409);
    expect(await prisma.auditRun.count({ where: { clientId: c.id } })).toBe(1);
    // espera a rodada (vazia) fechar antes do teste seguinte e do desligamento do banco
    for (let i = 0; i < 50 && (await prisma.auditRun.count({ where: { clientId: c.id, status: 'RODANDO' } })); i++) await new Promise((ok) => setTimeout(ok, 40));
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

describe('exportacao: relatorio cortado no teto', () => {
  const where = () => ({ severity: { not: 'ok' }, document: { clientId: ids.clientA } });
  let extra = '';
  beforeAll(async () => {
    const f = await prisma.finding.create({ data: { documentId: ids.docA, ruleCode: 'R2', field: 'cfop', kind: 'tecnica', severity: 'atencao', observed: 'a', expected: 'b' } });
    extra = f.id;
  });
  afterAll(async () => { await prisma.finding.delete({ where: { id: extra } }); });

  it('o modelo diz quando o teto cortou linhas, e devolve so ate o teto', async () => {
    const { listForExport } = await import('../src/models/finding.js');
    const todos = await listForExport(where(), 100);
    expect(todos.truncated).toBe(false);
    expect(todos.rows.length).toBeGreaterThanOrEqual(2);
    const cortado = await listForExport(where(), 1);
    expect(cortado.truncated).toBe(true);
    expect(cortado.rows).toHaveLength(1);
    const exato = await listForExport(where(), todos.rows.length); // no limite exato nao e corte
    expect(exato.truncated).toBe(false);
  });

  it('sem corte, a resposta nao traz o aviso', async () => {
    const t = await token('admin@a.test');
    for (const format of ['csv', 'xlsx']) {
      const r = await app.inject({ method: 'GET', url: `/api/audit/export?clientId=${ids.clientA}&format=${format}`, headers: auth(t) });
      expect(r.statusCode, format).toBe(200);
      expect(r.headers['x-export-truncated'], format).toBeUndefined();
    }
  });

  it('a planilha avisa dentro do arquivo quando foi cortada, e nao avisa quando esta completa', async () => {
    const { toXlsx } = await import('../src/services/audit-export.js');
    const ExcelJS = (await import('exceljs')).default;
    const resumo = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      const texto: string[] = [];
      wb.getWorksheet('Resumo')!.eachRow((row) => texto.push(String(row.getCell(1).value ?? '')));
      return texto.join('\n');
    };
    const cliente = { name: 'Cliente A', cnpj: '11222333000181' };
    expect(await resumo(await toXlsx(cliente, [['x']], 50000))).toContain('relatório incompleto');
    expect(await resumo(await toXlsx(cliente, [['x']]))).not.toContain('incompleto');
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

  it('HTML da nota usa so fontes locais: nao chama o Google nem o libera na CSP', async () => {
    const t = await token('admin@a.test');
    const r = await app.inject({ method: 'GET', url: `/api/notes/${ids.docA}/pdf.html`, headers: auth(t) });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(/googleapis|gstatic/);
    expect(r.body).toContain("font-src 'self'");
    expect(r.body).toContain('/fonts/onest-latin.woff2'); // @font-face local, da mesma origem do app
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
    // as fontes sao locais: nenhum terceiro liberado para fonte nem estilo
    expect(r.headers['content-security-policy']).not.toMatch(/googleapis|gstatic/);
    expect(r.headers['content-security-policy']).toContain("font-src 'self' data:");
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('corpo JSON acima de 1 MB e recusado', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@a.test', password: 'x'.repeat(2 * 1024 * 1024) }, headers: freshIp() });
    expect(r.statusCode).toBe(413);
  });
});
