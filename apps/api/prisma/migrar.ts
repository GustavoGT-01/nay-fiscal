/**
 * Prepara a estrutura do banco SEM apagar dados. Substitui o `prisma db push` que rodava a cada abertura.
 *
 *   npm run db:migrate
 *
 * - banco que nao existe: cria pelas migracoes;
 * - banco com migracoes pendentes: faz uma copia de seguranca e aplica;
 * - banco criado antes das migracoes (com `db push`): copia, leva ate a estrutura inicial (baseline.prisma)
 *   sem aceitar perda de dados, marca a migracao inicial como aplicada e aplica as seguintes;
 * - se algo nao puder ser feito sem perder dados, para e avisa: o banco fica como estava.
 */
try { process.loadEnvFile(); } catch { /* sem .env: usa o padrao */ }
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const AQUI = dirname(fileURLToPath(import.meta.url));
// os testes apontam para uma copia do schema e das migracoes
const SCHEMA = resolve(process.env.PRISMA_SCHEMA ?? join(AQUI, 'schema.prisma'));
const BASELINE = join(AQUI, 'baseline.prisma');
const MIGRACOES = join(dirname(SCHEMA), 'migrations');
const INICIAL = '0_init';
const CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');

class Parar extends Error {}

const url = process.env.DATABASE_URL || 'file:./dev.db';

/** Roda o CLI do Prisma sem terminal interativo (assim ele nunca pergunta "aceita perder dados?"). */
function prisma(args: string[], databaseUrl: string) {
  try {
    return execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(`prisma ${args.join(' ')} falhou:\n${err.stdout ?? ''}${err.stderr ?? ''}`, { cause: e });
  }
}

const migracoesNoCodigo = () => readdirSync(MIGRACOES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

/** O que existe no banco: tabelas do app e o registro das migracoes. */
async function situacao(db: PrismaClient) {
  const tabelas = (await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)).map((t) => t.name);
  const temRegistro = tabelas.includes('_prisma_migrations');
  const linhas = temRegistro
    ? await db.$queryRawUnsafe<{ migration_name: string; ok: number; desfeita: number }[]>(
        'SELECT migration_name, finished_at IS NOT NULL AS ok, rolled_back_at IS NOT NULL AS desfeita FROM _prisma_migrations')
    : [];
  return {
    vazio: tabelas.filter((t) => t !== '_prisma_migrations').length === 0 && linhas.length === 0,
    temRegistro,
    aplicadas: new Set(linhas.filter((l) => Number(l.ok) && !Number(l.desfeita)).map((l) => l.migration_name)),
    quebradas: linhas.filter((l) => !Number(l.ok) && !Number(l.desfeita)).map((l) => l.migration_name),
  };
}

/** Copia inteira e consistente do banco (inclui o que ainda esta no arquivo WAL). Nada e apagado depois. */
async function copiar(db: PrismaClient, arquivo: string) {
  const pasta = join(dirname(arquivo), 'backups');
  mkdirSync(pasta, { recursive: true });
  const carimbo = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
  const destino = join(pasta, `${basename(arquivo).replace(/\.db$/, '')}-${carimbo}.db`);
  await db.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/\\/g, '/').replace(/'/g, "''")}'`);
  return destino;
}

async function main() {
  if (!url.startsWith('file:')) {
    // outro banco (ex.: Postgres): a copia de seguranca e responsabilidade de quem administra
    prisma(['migrate', 'deploy', '--schema', SCHEMA], url);
    console.log('Banco atualizado.');
    return;
  }

  const [caminho = '', consulta] = url.slice('file:'.length).split('?');
  const arquivo = resolve(dirname(SCHEMA), caminho); // o Prisma resolve caminho relativo a partir da pasta do schema
  const absoluta = `file:${arquivo.replace(/\\/g, '/')}${consulta ? '?' + consulta : ''}`;

  if (!existsSync(arquivo) || statSync(arquivo).size === 0) {
    prisma(['migrate', 'deploy', '--schema', SCHEMA], absoluta);
    console.log(`Banco criado em ${arquivo}.`);
    return;
  }

  const db = new PrismaClient({ datasources: { db: { url: absoluta } } });
  let antes: Awaited<ReturnType<typeof situacao>>;
  let copia = '';
  try {
    antes = await situacao(db);
    if (antes.quebradas.length) {
      throw new Parar(`A migração ${antes.quebradas.join(', ')} parou no meio numa execução anterior. Restaure a última cópia em ${join(dirname(arquivo), 'backups')} e rode de novo.`);
    }
    if (antes.temRegistro && migracoesNoCodigo().every((m) => antes.aplicadas.has(m))) {
      console.log('Banco em dia.');
      return;
    }
    if (!antes.vazio) copia = await copiar(db, arquivo);
  } catch (e) {
    if (e instanceof Parar) throw e;
    // arquivo que nao e um banco, disco cheio na copia, arquivo travado: nada foi alterado ate aqui
    const motivo = (e as Error).message.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? 'erro desconhecido';
    throw new Parar(`Não foi possível ler ou copiar o banco ${arquivo}. Nada foi alterado.\n${motivo}`);
  } finally {
    await db.$disconnect(); // o SQLite precisa estar livre para o CLI
  }
  if (copia) console.log(`Cópia de segurança: ${copia}`);

  if (!antes.vazio && !antes.aplicadas.has(INICIAL)) {
    console.log('Banco criado antes das migrações: levando até a estrutura inicial…');
    try {
      prisma(['db', 'push', '--schema', BASELINE, '--skip-generate'], absoluta); // sem --accept-data-loss, de proposito
    } catch (e) {
      throw new Parar(`Este banco não pode ser atualizado sem perder dados, então nada foi alterado.\nHá uma cópia em ${copia}.\n\n${(e as Error).message}`);
    }
    prisma(['migrate', 'resolve', '--applied', INICIAL, '--schema', SCHEMA], absoluta);
  }

  try {
    prisma(['migrate', 'deploy', '--schema', SCHEMA], absoluta);
  } catch (e) {
    throw new Parar(`A atualização falhou.${copia ? ` Restaure a cópia ${copia} sobre ${arquivo}.` : ''}\n\n${(e as Error).message}`);
  }
  console.log('Banco atualizado.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Parar ? e.message : e);
  process.exitCode = 1;
});
