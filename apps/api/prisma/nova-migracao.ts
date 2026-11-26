/**
 * Cria a migracao com a diferenca entre as migracoes existentes e o schema.prisma. Nao toca em nenhum banco seu:
 * usa um banco de rascunho temporario.
 *
 *   npm run db:nova -w @nay/api -- nome_da_mudanca
 *
 * Revise o migration.sql gerado antes de commitar (renomear coluna, por exemplo, sai como apagar e criar).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = resolve(process.env.PRISMA_SCHEMA ?? join(dirname(fileURLToPath(import.meta.url)), 'schema.prisma'));
const MIGRACOES = join(dirname(SCHEMA), 'migrations');
const CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');

const nome = (process.argv[2] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
if (!nome) {
  console.error('Uso: npm run db:nova -w @nay/api -- nome_da_mudanca');
  process.exit(1);
}

const rascunho = mkdtempSync(join(tmpdir(), 'nay-migracao-'));
try {
  const sombra = `file:${join(rascunho, 'sombra.db').replace(/\\/g, '/')}`;
  const sql = execFileSync(process.execPath, [CLI, 'migrate', 'diff', '--from-migrations', MIGRACOES, '--to-schema-datamodel', SCHEMA, '--shadow-database-url', sombra, '--script'], {
    env: { ...process.env, DATABASE_URL: sombra, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (/^-- This is an empty migration\.\s*$/.test(sql.trim())) {
    console.log('Nada mudou no schema.prisma em relação às migrações.');
  } else {
    const pasta = join(MIGRACOES, `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${nome}`);
    mkdirSync(pasta);
    writeFileSync(join(pasta, 'migration.sql'), sql);
    console.log(`Criada: ${pasta}\nRevise o SQL e rode "npm run db:migrate".`);
  }
} finally {
  rmSync(rascunho, { recursive: true, force: true });
}
