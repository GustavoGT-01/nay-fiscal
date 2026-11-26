import { prisma } from '../config/db.js';
import type { Divergence } from '../services/sped/crosscheck.js';

/** Maximo de divergencias guardadas por arquivo; a contagem total fica em `divergenceCount`. */
export const MAX_STORED_DIVERGENCES = 10_000;

export const create = (data: {
  clientId: string; fileName: string; cnpj: string; periodStart: Date; periodEnd: Date; entries: number; ignored: number;
  divergences: Divergence[];
}) =>
  prisma.spedFile.create({
    data: {
      clientId: data.clientId, fileName: data.fileName, cnpj: data.cnpj, periodStart: data.periodStart, periodEnd: data.periodEnd,
      entries: data.entries, ignored: data.ignored, divergenceCount: data.divergences.length,
      divergences: { create: data.divergences.slice(0, MAX_STORED_DIVERGENCES).map(({ kind, key, number, documentId, sped, xml }) => ({ kind, key, number, documentId, sped, xml })) },
    },
  });

export const listOfClient = (clientId: string) =>
  prisma.spedFile.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 24 });

export const countKinds = (spedFileId: string) =>
  prisma.spedDivergence.groupBy({ by: ['kind'], where: { spedFileId }, _count: true });

/** Arquivo do escritorio (ou null). */
export const findOfOffice = (id: string, officeId: string) =>
  prisma.spedFile.findFirst({ where: { id, client: { officeId } } });

export const divergencesPage = (spedFileId: string, kind: string | undefined, skip: number, take: number) => {
  const where = { spedFileId, ...(kind ? { kind } : {}) };
  return Promise.all([
    prisma.spedDivergence.count({ where }),
    prisma.spedDivergence.findMany({ where, orderBy: [{ kind: 'asc' }, { number: 'asc' }, { id: 'asc' }], skip, take }),
  ]);
};

/** Notas NF-e/NFC-e do cliente emitidas no periodo, mais as achadas pelas chaves (que podem estar fora dele). */
export async function docsForCheck(clientId: string, from: Date, to: Date, keys: string[]) {
  const select = { id: true, key: true, number: true, total: true, vIcms: true, direction: true, cancelled: true } as const;
  const noPeriodo = await prisma.document.findMany({ where: { clientId, model: { in: ['55', '65'] }, issuedAt: { gte: from, lte: to } }, select });
  const porChave = new Map(noPeriodo.map((d) => [d.key, d]));
  const faltam = keys.filter((k) => !porChave.has(k));
  for (let i = 0; i < faltam.length; i += 500) {
    for (const d of await prisma.document.findMany({ where: { clientId, key: { in: faltam.slice(i, i + 500) } }, select })) porChave.set(d.key, d);
  }
  return { noPeriodo, porChave };
}
