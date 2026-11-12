import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { DOC_MONEY, ITEM_MONEY, fromDb, toDb } from '../lib/money.js';

export const countByClientAndStatus = (clientIds: string[]) =>
  prisma.document.groupBy({ by: ['clientId', 'status'], _count: true, where: { clientId: { in: clientIds } } });

export const countByDirectionAndVerdict = (clientId: string) =>
  prisma.document.groupBy({ by: ['direction', 'verdict'], _count: true, where: { clientId } });

export const countByStatus = (clientId: string) =>
  prisma.document.groupBy({ by: ['status'], _count: true, where: { clientId } });

export const worstSuppliers = (clientId: string) =>
  prisma.document.groupBy({
    by: ['emitterName'], _count: true, where: { clientId, status: 'erro', direction: 'entrada' },
    orderBy: { _count: { emitterName: 'desc' } }, take: 3,
  });

/** Notas do cliente com os achados que pesam no painel Inicio. */
export const listForDashboard = (clientId: string, direction: Prisma.DocumentWhereInput) =>
  prisma.document.findMany({
    where: { clientId, ...direction },
    orderBy: { issuedAt: 'asc' },
    select: {
      id: true, number: true, status: true, total: true, direction: true, emitterName: true, emitterCnpj: true,
      recipientName: true, recipientCnpj: true, auditedAt: true, issuedAt: true,
      findings: { where: { severity: { in: ['erro', 'atencao'] } }, select: { ruleCode: true, severity: true } },
    },
  }).then(fromDb);

export const count = (where: Prisma.DocumentWhereInput) => prisma.document.count({ where });

export const listPage = (where: Prisma.DocumentWhereInput, skip: number, take: number) =>
  prisma.document.findMany({
    where, orderBy: { issuedAt: 'desc' }, skip, take,
    include: {
      items: { select: { cfop: true }, take: 1, orderBy: { n: 'asc' } },
      findings: { where: { severity: { in: ['erro', 'atencao', 'a_verificar'] } }, select: { ruleCode: true, severity: true } },
    },
  }).then(fromDb);

export const listNfseForSummary = (where: Prisma.DocumentWhereInput) =>
  prisma.document.findMany({ where, select: { nfse: true, status: true, direction: true } });

/** Nota (do escritorio) com itens e achados. */
export const findFullOfOffice = (id: string, officeId: string) =>
  prisma.document.findFirst({ where: { id, client: { officeId } }, include: { items: { orderBy: { n: 'asc' } }, findings: true } }).then(fromDb);

/** Nota (do escritorio) com a contagem do que sai junto ao apagar. */
export const findForDelete = (id: string, officeId: string) =>
  prisma.document.findFirst({
    where: { id, client: { officeId } },
    select: { id: true, number: true, model: true, _count: { select: { items: true, findings: true } } },
  });

export const remove = (id: string) => prisma.document.delete({ where: { id } });

export const findWithItems = (id: string) => prisma.document.findUniqueOrThrow({ where: { id }, include: { items: true } }).then(fromDb);

export const findByKey = (clientId: string, key: string) =>
  prisma.document.findUnique({ where: { clientId_key: { clientId, key } } }).then(fromDb);

/** Cliente dono da nota com esta chave, dentro do escritorio. */
export const findOwnerByKey = (key: string, officeId: string) =>
  prisma.document.findFirst({ where: { key, client: { officeId } }, select: { clientId: true } });

export const markCancelled = (id: string) => prisma.document.update({ where: { id }, data: { cancelled: true } });

/** Grava a nota e os itens numa unica transacao: ou entra tudo, ou nada. */
export const saveWithItems = (
  existingId: string | null,
  data: object,
  items: object[],
) =>
  prisma.$transaction(async (tx) => {
    // entra em reais (como o parser entrega) e vira centavos so aqui
    const docData = toDb(data, DOC_MONEY) as Prisma.DocumentUncheckedCreateInput;
    const doc = existingId
      ? await tx.document.update({ where: { id: existingId }, data: { ...docData, items: { deleteMany: {} } } })
      : await tx.document.create({ data: docData });
    await tx.documentItem.createMany({ data: items.map((i) => ({ ...toDb(i, ITEM_MONEY), documentId: doc.id }) as Prisma.DocumentItemUncheckedCreateInput) });
    return fromDb(doc);
  });

export const idsForAudit = (clientId: string, from?: Date, to?: Date) =>
  prisma.document.findMany({ where: { clientId, issuedAt: { gte: from, lte: to } }, select: { id: true } });

export const groupBySupplier = (where: Prisma.DocumentWhereInput) =>
  prisma.document.groupBy({ by: ['emitterCnpj', 'emitterName', 'status'], _count: true, where });

export const groupByCustomer = (where: Prisma.DocumentWhereInput) =>
  prisma.document.groupBy({ by: ['recipientCnpj', 'recipientName', 'status'], _count: true, where });

export const countOfClient = (clientId: string) => prisma.document.count({ where: { clientId } });