import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * SQLite em modo WAL: quem le nao espera quem grava. No modo padrao, o painel trava enquanto uma importacao
 * grava (e uma auditoria e a importacao se atrapalham). O modo fica gravado no proprio arquivo do banco.
 *
 * So roda ao subir o servidor, nunca nos testes: o WAL cria arquivos `-wal`/`-shm` junto do banco, e apagar o
 * `.db` sem eles deixaria o proximo banco novo herdar paginas do anterior.
 * SQLITE_WAL=0 desliga. Sem efeito fora do SQLite.
 *
 * Para copiar o banco como backup, feche o app antes (assim o WAL volta para dentro do `.db`).
 */
export async function tuneSqlite() {
  if (process.env.SQLITE_WAL === '0' || !(process.env.DATABASE_URL ?? '').startsWith('file:')) return null;
  const rows = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode=WAL');
  return rows[0]?.journal_mode ?? null;
}
