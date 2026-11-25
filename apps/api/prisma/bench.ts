/**
 * Medicao de desempenho com um banco grande e descartavel (prisma/bench.db, nunca o dev.db).
 * Gera N notas direto no banco e cronometra as telas pesadas; depois importa um ZIP de XMLs pelo caminho real.
 *
 *   npm run bench -w @nay/api -- [notas=20000] [xmls=1000]
 *
 * Saida: mediana de 3 chamadas, tamanho da resposta e pico de memoria (RSS) durante cada uma.
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { buildNfe, cnpjFrom } from './demo/nfe-builder.js';
import { makeZip, multipart } from '../test/helpers/zip.js';

const NOTAS = Number(process.argv[2] ?? 20_000);
const XMLS = Number(process.argv[3] ?? 1_000);
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const DB_FILE = fileURLToPath(new URL('./bench.db', import.meta.url));
process.env.DATABASE_URL = 'file:./bench.db';
process.env.JWT_SECRET = 'bench-segredo-descartavel-com-mais-de-32-caracteres';

for (const f of [DB_FILE, DB_FILE + '-journal', DB_FILE + '-wal', DB_FILE + '-shm']) if (existsSync(f)) rmSync(f);
execSync('npx prisma db push --skip-generate', { cwd: API_DIR, env: { ...process.env }, stdio: 'ignore' });

const { prisma, tuneSqlite } = await import('../src/config/db.js');
const { buildApp } = await import('../src/app.js');
const bcrypt = (await import('bcryptjs')).default;

const mb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;
const EMPRESA = cnpjFrom('556677880001');
const MGA = { city: 'Maringá', cityCode: '4115200', uf: 'PR' };

// o servidor liga o WAL ao subir; o bench faz o mesmo (SQLITE_WAL=0 mede sem ele)
console.log('modo do SQLite:', (await tuneSqlite()) ?? 'padrao (rollback journal)');

// ---------- dados ----------
const office = await prisma.office.create({ data: { name: 'Bench' } });
await prisma.user.create({ data: { name: 'Admin', email: 'bench@b.test', passwordHash: await bcrypt.hash('bench-senha-123', 4), role: 'ADMIN', officeId: office.id } });
const client = await prisma.client.create({ data: { officeId: office.id, name: 'Empresa Bench', cnpj: EMPRESA, ...MGA } });

const XML_TIPICO = '<NFe>' + '<det nItem="1"><prod><cProd>1</cProd><xProd>Produto de teste</xProd></prod></det>'.repeat(40) + '</NFe>'; // ~3 KB, como uma NF-e pequena
const NFSE_JSON = JSON.stringify({ serviceCode: '170101', description: 'Consultoria', issRate: 5, issValue: 50, issRetention: '1', serviceValue: 1000, issBase: 1000, discounts: 0, retentionsTotal: 0, netValue: 1000, retPis: 0, retCofins: 0, retIrrf: 0, retCsll: 0, retCp: 0, competence: null });
const VEREDITO: Record<string, [string, string]> = { ok: ['pode_creditar', 'correta'], erro: ['credito_em_risco', 'corrigir'], atencao: ['pode_creditar', 'correta'], cancelada: ['nao_creditar', 'cancelada'] };
const STATUS = ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'erro', 'erro', 'atencao', 'cancelada'];
const base = new Date('2026-11-20T12:00:00-03:00').getTime();
const rid = () => crypto.randomUUID();

console.log(`Gerando ${NOTAS.toLocaleString('pt-BR')} notas...`);
const t0 = Date.now();
for (let start = 0; start < NOTAS; start += 400) {
  const docs: Prisma.DocumentCreateManyInput[] = [];
  const items: { documentId: string; n: number; cfop: string; total: bigint }[] = [];
  const finds: { documentId: string; ruleCode: string; field: string; kind: string; severity: string; observed: string; expected: string }[] = [];
  for (let i = start; i < Math.min(NOTAS, start + 400); i++) {
    const id = rid();
    const status = STATUS[i % STATUS.length]!;
    const entrada = i % 3 !== 0;
    const forn = cnpjFrom(String(100000000000 + (i % 60)));
    const nfse = i % 20 === 0;
    docs.push({
      id, clientId: client.id, model: nfse ? 'NFSE' : '55', key: String(i).padStart(44, '0'), number: String(i), series: '1',
      direction: entrada ? 'entrada' : 'saida', issuedAt: new Date(base - (i % 400) * 86_400_000 - (i % 24) * 3_600_000),
      emitterCnpj: entrada ? forn : EMPRESA, emitterName: entrada ? `Fornecedor ${i % 60}` : 'Empresa Bench',
      recipientCnpj: entrada ? EMPRESA : forn, recipientName: entrada ? 'Empresa Bench' : `Cliente ${i % 60}`,
      total: BigInt(10_000 + ((i * 7919) % 900_000)), status, verdict: VEREDITO[status]![entrada ? 0 : 1], auditedAt: new Date(base),
      cancelled: status === 'cancelada', xml: XML_TIPICO, nfse: nfse ? NFSE_JSON : null,
    });
    items.push({ documentId: id, n: 1, cfop: entrada ? '1102' : '5102', total: 10_000n });
    if (status === 'erro') finds.push({ documentId: id, ruleCode: 'cfop-cclasstrib-remessa', field: 'cclass_trib', kind: 'tributaria', severity: 'erro', observed: '000001', expected: '410999' });
    if (status === 'atencao') finds.push({ documentId: id, ruleCode: 'cst-pis-atipico-simples', field: 'cst_pis', kind: 'tributaria', severity: 'atencao', observed: '01', expected: '49' });
  }
  await prisma.document.createMany({ data: docs });
  await prisma.documentItem.createMany({ data: items });
  if (finds.length) await prisma.finding.createMany({ data: finds });
}
console.log(`  pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s | banco: ${mb(statSync(DB_FILE).size)} MB\n`);

// ---------- medicao ----------
const app = await buildApp();
await app.ready();
const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bench@b.test', password: 'bench-senha-123' } });
const token = login.json().accessToken as string;
const headers = { authorization: `Bearer ${token}` };
const cid = `clientId=${client.id}`;

/** Pico de RSS enquanto `fn` roda (amostra a cada 5 ms). */
async function comPico<T>(fn: () => Promise<T>) {
  let pico = process.memoryUsage().rss;
  const t = setInterval(() => { pico = Math.max(pico, process.memoryUsage().rss); }, 5);
  try { return { r: await fn(), pico }; } finally { clearInterval(t); }
}

const linhas: { nome: string; ms: number; kb: number; rss: number }[] = [];
async function medir(nome: string, url: string) {
  const tempos: number[] = [];
  let kb = 0;
  let rss = 0;
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    const { r, pico } = await comPico(() => app.inject({ method: 'GET', url, headers }));
    tempos.push(performance.now() - a);
    if (r.statusCode !== 200) throw new Error(`${nome}: HTTP ${r.statusCode} ${r.body.slice(0, 120)}`);
    kb = Math.round(r.rawPayload.length / 1024);
    rss = Math.max(rss, pico);
  }
  tempos.sort((x, y) => x - y);
  linhas.push({ nome, ms: Math.round(tempos[1]!), kb, rss: mb(rss) });
}

await medir('painel (Início)', `/api/dashboard?${cid}`);
await medir('achados por regra', `/api/audit/rules?${cid}&direction=all`);
await medir('achados por fornecedor', `/api/audit/suppliers?${cid}&direction=all`);
await medir('resumo NFS-e', `/api/nfse/summary?${cid}`);
await medir('lista de notas (pág. 1)', `/api/notes?${cid}&size=12`);
await medir('busca por texto', `/api/notes?${cid}&q=Fornecedor%207`);
await medir('lista de clientes', `/api/clients`);
await medir('exportar CSV', `/api/audit/export?${cid}&format=csv`);

console.log('Tela / rota'.padEnd(28), 'mediana'.padStart(9), 'resposta'.padStart(10), 'pico RSS'.padStart(10));
for (const l of linhas) console.log(l.nome.padEnd(28), `${l.ms} ms`.padStart(9), `${l.kb.toLocaleString('pt-BR')} KB`.padStart(10), `${l.rss} MB`.padStart(10));

// ---------- importacao ----------
if (XMLS > 0) {
  console.log(`\nImportando um ZIP de ${XMLS.toLocaleString('pt-BR')} XMLs pelo caminho real...`);
  const arquivos = Array.from({ length: XMLS }, (_, i) => ({
    name: `n${i}.xml`,
    data: Buffer.from(buildNfe({
      uf: '41', issuedAt: new Date('2026-10-20T10:00:00-03:00'), number: 900_000 + i, natOp: 'VENDA',
      emitter: { cnpj: cnpjFrom('998877660001'), name: 'Fornecedor ZIP', ...MGA, crt: '3' },
      recipient: { cnpj: EMPRESA, name: 'Empresa Bench', ...MGA },
      items: [{ code: '1', description: 'Item', ncm: '94016100', cfop: '5102', qty: 1, unit: 100, icms: { table: 'CST', code: '00', aliq: 12 }, ibscbs: { cst: '000', cClassTrib: '000001', valores: true } }],
    }).xml),
  }));
  const zip = makeZip(arquivos);
  const m = await multipart([{ name: 'lote.zip', data: zip }], { clientId: client.id });
  const rssAntes = process.memoryUsage().rss;
  // enquanto importa, alguem abre o painel a cada 250 ms: mede quanto a tela espera a gravacao
  const latencias: number[] = [];
  const { r: up, pico } = await comPico(async () => {
    const a = performance.now();
    const r = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...headers, ...m.headers }, payload: m.payload });
    const id = (r.json() as { id: string }[])[0]!.id;
    // BENCH_PROBE=0 mede a importacao sozinha (sem ninguem usando as telas)
    const sonda = process.env.BENCH_PROBE === '0' ? null : setInterval(async () => {
      const t = performance.now();
      const x = await app.inject({ method: 'GET', url: `/api/dashboard?${cid}`, headers });
      if (x.statusCode === 200) latencias.push(performance.now() - t);
    }, 250);
    try {
      for (;;) {
        const u = (await app.inject({ method: 'GET', url: `/api/uploads/${id}`, headers })).json() as { status: string; okCount: number; errorCount: number; message: string | null };
        if (u.status !== 'PROCESSANDO' && u.status !== 'PENDENTE') return { ...u, ms: performance.now() - a };
        await new Promise((ok) => setTimeout(ok, 100));
      }
    } finally {
      if (sonda) clearInterval(sonda);
    }
  });
  latencias.sort((x, y) => x - y);
  if (latencias.length) console.log(`  painel aberto durante a importação: ${latencias.length} chamadas, mediana ${Math.round(latencias[Math.floor(latencias.length / 2)] ?? 0)} ms, pior ${Math.round(latencias.at(-1) ?? 0)} ms`);
  console.log(`  ${up.status}: ${up.okCount + up.errorCount} notas em ${(up.ms / 1000).toFixed(1)} s (${Math.round((up.okCount + up.errorCount) / (up.ms / 1000))} notas/s) | ZIP: ${mb(zip.length)} MB | pico RSS: ${mb(pico)} MB (antes: ${mb(rssAntes)} MB)${up.message ? ' | ' + up.message : ''}`);
}

await app.close();
await prisma.$disconnect();
for (const f of [DB_FILE, DB_FILE + '-journal', DB_FILE + '-wal', DB_FILE + '-shm']) if (existsSync(f)) rmSync(f, { force: true });
