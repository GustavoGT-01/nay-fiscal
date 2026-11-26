import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// Migracoes: o caminho que o iniciar.bat usa nunca pode perder dados. Tudo em pastas temporarias.
const API = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA = join(API, 'prisma', 'schema.prisma');
const BASELINE = join(API, 'prisma', 'baseline.prisma');
const ANTIGO = join(API, 'test', 'fixtures', 'schema-antes-das-migracoes.prisma');
const require = createRequire(import.meta.url);
const PRISMA = require.resolve('prisma/build/index.js');
const TSX = require.resolve('tsx/cli');
const LENTO = 90_000; // cada passo chama o CLI do Prisma; o CI do Windows e devagar

const pastas: string[] = [];
const pasta = () => { const p = mkdtempSync(join(tmpdir(), 'nay-mig-test-')); pastas.push(p); return p; };
afterAll(() => { for (const p of pastas) rmSync(p, { recursive: true, force: true }); });

const urlDe = (arquivo: string) => `file:${arquivo.replace(/\\/g, '/')}`;
const rodar = (args: string[], env: Record<string, string>) => {
  const r = spawnSync(process.execPath, args, { cwd: API, env: { ...process.env, CHECKPOINT_DISABLE: '1', ...env }, encoding: 'utf8' });
  return { status: r.status, saida: `${r.stdout}${r.stderr}` };
};
const migrar = (db: string, env: Record<string, string> = {}) => rodar([TSX, 'prisma/migrar.ts'], { DATABASE_URL: urlDe(db), ...env });
const empurrar = (schema: string, db: string) => {
  const r = rodar([PRISMA, 'db', 'push', '--schema', schema, '--skip-generate'], { DATABASE_URL: urlDe(db) });
  expect(r.status, r.saida).toBe(0);
};
/** 0 = o banco tem exatamente a estrutura do schema; 2 = ha diferenca. */
const diferenca = (db: string, schema = SCHEMA) => rodar([PRISMA, 'migrate', 'diff', '--from-url', urlDe(db), '--to-schema-datamodel', schema, '--exit-code'], { DATABASE_URL: urlDe(db) });

async function sql<T = Record<string, unknown>>(db: string, ...comandos: string[]) {
  const c = new PrismaClient({ datasources: { db: { url: urlDe(db) } } });
  try {
    let linhas: T[] = [];
    for (const q of comandos) {
      if (/^select/i.test(q)) linhas = await c.$queryRawUnsafe<T[]>(q);
      else await c.$executeRawUnsafe(q);
    }
    return linhas;
  } finally {
    await c.$disconnect();
  }
}
const popular = (db: string) => sql(db,
  `INSERT INTO "Office" ("id","name") VALUES ('o1','Escritório de verdade')`,
  `INSERT INTO "Client" ("id","officeId","name","cnpj") VALUES ('c1','o1','Cliente com dados','00000000000101')`,
  `INSERT INTO "Upload" ("id","officeId","fileName","kind") VALUES ('u1','o1','lote.zip','ZIP')`,
);
const dados = (db: string) => sql<{ escritorio: string; cliente: string; envio: string }>(db,
  `SELECT o.name AS escritorio, c.name AS cliente, u.fileName AS envio FROM "Office" o JOIN "Client" c ON c.officeId = o.id JOIN "Upload" u ON u.officeId = o.id`);
const ESPERADO = [{ escritorio: 'Escritório de verdade', cliente: 'Cliente com dados', envio: 'lote.zip' }];
const registro = (db: string) => sql<{ migration_name: string }>(db, `SELECT migration_name FROM _prisma_migrations ORDER BY migration_name`);
const tabelas = async (db: string) => (await sql<{ name: string }>(db, `SELECT name FROM sqlite_master WHERE type='table'`)).map((t) => t.name);
const copias = (dir: string) => (existsSync(join(dir, 'backups')) ? readdirSync(join(dir, 'backups')).map((f) => join(dir, 'backups', f)) : []);

/** Copia o schema e as migracoes para mexer sem tocar no repositorio. */
function projeto() {
  const p = pasta();
  cpSync(SCHEMA, join(p, 'schema.prisma'));
  cpSync(join(API, 'prisma', 'migrations'), join(p, 'migrations'), { recursive: true });
  return p;
}
const novaPasta = (p: string, nome: string, comando: string) => {
  mkdirSync(join(p, 'migrations', nome));
  writeFileSync(join(p, 'migrations', nome, 'migration.sql'), comando);
};

describe('migrações do banco', () => {
  it('banco novo: cria pelas migrações, igual ao schema.prisma, sem cópia; rodar de novo não faz nada', () => {
    const dir = pasta();
    const db = join(dir, 'novo.db');
    const r = migrar(db);
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toContain('Banco criado');
    const d = diferenca(db);
    expect(d.status, `schema.prisma mudou sem migração? Rode npm run db:nova.\n${d.saida}`).toBe(0);
    const outra = migrar(db);
    expect(outra.saida).toContain('Banco em dia');
    expect(copias(dir)).toEqual([]);
  }, LENTO);

  it('baseline.prisma continua sendo a estrutura da migração inicial (não pode ser editado)', () => {
    const r = rodar([PRISMA, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', BASELINE, '--script'], { DATABASE_URL: 'file:./nao-usado.db' });
    const lf = (s: string) => s.replace(/\r\n/g, '\n').trim();
    expect(r.status, r.saida).toBe(0);
    expect(lf(r.saida)).toBe(lf(readFileSync(join(API, 'prisma', 'migrations', '0_init', 'migration.sql'), 'utf8')));
  }, LENTO);

  it('banco antigo (criado com db push, versão anterior): atualiza, guarda os dados e faz uma cópia antes', async () => {
    const dir = pasta();
    const db = join(dir, 'antigo.db');
    empurrar(ANTIGO, db);
    await popular(db);

    const r = migrar(db);
    expect(r.status, r.saida).toBe(0);
    expect(await dados(db)).toEqual(ESPERADO);
    expect((await registro(db)).map((m) => m.migration_name)).toContain('0_init');
    expect(diferenca(db).status).toBe(0);

    const [copia, ...resto] = copias(dir);
    expect(resto).toEqual([]);
    expect(await dados(copia!)).toEqual(ESPERADO);
    expect(await tabelas(copia!)).not.toContain('_prisma_migrations'); // a copia e do banco como estava

    expect(migrar(db).saida).toContain('Banco em dia');
    expect(copias(dir)).toHaveLength(1);
  }, LENTO);

  it('banco que perderia dados: para, avisa e deixa tudo como estava', async () => {
    const dir = pasta();
    const db = join(dir, 'incompativel.db');
    empurrar(BASELINE, db);
    await popular(db);
    await sql(db, `ALTER TABLE "Client" ADD COLUMN "simplesOptante" TEXT`, `UPDATE "Client" SET "simplesOptante" = 'sim'`);

    const r = migrar(db);
    expect(r.status).toBe(1);
    expect(r.saida).toContain('sem perder dados');
    expect(await sql(db, `SELECT "simplesOptante" AS v FROM "Client"`)).toEqual([{ v: 'sim' }]);
    expect(await tabelas(db)).not.toContain('_prisma_migrations');
    expect(copias(dir)).toHaveLength(1);
  }, LENTO);

  it('arquivo que não é um banco: avisa em português e não mexe nele', () => {
    const dir = pasta();
    const db = join(dir, 'estragado.db');
    writeFileSync(db, 'isto e um texto, nao um banco SQLite');
    const r = migrar(db);
    expect(r.status).toBe(1);
    expect(r.saida).toContain('Nada foi alterado');
    expect(readFileSync(db, 'utf8')).toBe('isto e um texto, nao um banco SQLite');
  }, LENTO);

  it('migração nova pendente: copia o banco antes e aplica', async () => {
    const dir = pasta();
    const db = join(dir, 'app.db');
    const p = projeto();
    const env = { PRISMA_SCHEMA: join(p, 'schema.prisma') };
    expect(migrar(db, env).status).toBe(0);
    await popular(db);
    novaPasta(p, '99990101000000_teste', 'CREATE TABLE "Teste" ("id" TEXT NOT NULL PRIMARY KEY);\n');

    const r = migrar(db, env);
    expect(r.status, r.saida).toBe(0);
    expect(await tabelas(db)).toContain('Teste');
    expect(await dados(db)).toEqual(ESPERADO);
    expect(copias(dir)).toHaveLength(1);
    expect(await tabelas(copias(dir)[0]!)).not.toContain('Teste');
  }, LENTO);

  it('migração que falha: diz qual cópia restaurar, e não segue em frente na próxima vez', async () => {
    const dir = pasta();
    const db = join(dir, 'app.db');
    const p = projeto();
    const env = { PRISMA_SCHEMA: join(p, 'schema.prisma') };
    expect(migrar(db, env).status).toBe(0);
    await popular(db);
    novaPasta(p, '99990101000000_quebrada', 'CREATE TABLE "Office" ("id" TEXT);\n'); // ja existe

    const r = migrar(db, env);
    expect(r.status).toBe(1);
    expect(r.saida).toContain('Restaure a cópia');
    expect(await dados(db)).toEqual(ESPERADO);
    const outra = migrar(db, env);
    expect(outra.status).toBe(1);
    expect(outra.saida).toContain('parou no meio');
  }, LENTO);

  it('db:nova cria a migração da diferença e não faz nada quando não há diferença', () => {
    const p = projeto();
    const env = { PRISMA_SCHEMA: join(p, 'schema.prisma'), DATABASE_URL: 'file:./nao-usado.db' };
    const antes = readdirSync(join(p, 'migrations'));
    expect(rodar([TSX, 'prisma/nova-migracao.ts', 'nada'], env).saida).toContain('Nada mudou');
    expect(readdirSync(join(p, 'migrations'))).toEqual(antes);

    const schema = readFileSync(join(p, 'schema.prisma'), 'utf8');
    writeFileSync(join(p, 'schema.prisma'), schema.replace('model Office {', 'model Office {\n  apelido String?'));
    const r = rodar([TSX, 'prisma/nova-migracao.ts', 'Apelido do escritório'], env);
    expect(r.status, r.saida).toBe(0);
    const criada = readdirSync(join(p, 'migrations')).find((n) => /^\d{14}_apelido_do_escritorio$/.test(n))!;
    expect(readFileSync(join(p, 'migrations', criada, 'migration.sql'), 'utf8')).toContain('ADD COLUMN "apelido"');
  }, LENTO);
});
