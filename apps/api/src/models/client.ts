import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';

export const listWithEstablishments = (officeId: string) =>
  prisma.client.findMany({ where: { officeId }, include: { establishments: true }, orderBy: { name: 'asc' } });

/** Cliente do escritorio (null se nao existir ou for de outro escritorio). */
export const findOfOffice = (id: string, officeId: string) => prisma.client.findFirst({ where: { id, officeId } });

export const findById = (id: string) => prisma.client.findUniqueOrThrow({ where: { id } });

export const findByIdOrNull = (id: string) => prisma.client.findUnique({ where: { id } });

/** Cliente que ja usa esta raiz de CNPJ (como matriz ou em algum estabelecimento). */
export const findByCnpjRoot = (officeId: string, root: string) =>
  prisma.client.findFirst({
    where: { officeId, OR: [{ cnpj: { startsWith: root } }, { establishments: { some: { cnpj: { startsWith: root } } } }] },
  });

export const create = (data: Prisma.ClientUncheckedCreateInput) => prisma.client.create({ data });

export const update = (id: string, data: Prisma.ClientUpdateInput) => prisma.client.update({ where: { id }, data });

export const remove = (id: string) => prisma.client.delete({ where: { id } });

export const idsOfOffice = (officeId: string) => prisma.client.findMany({ where: { officeId }, select: { id: true } });

export const summaryOfOffice = (officeId: string) =>
  prisma.client.findMany({
    where: { officeId },
    select: { id: true, name: true, cnpj: true, _count: { select: { documents: true, uploads: true } } },
    orderBy: { name: 'asc' },
  });

/** Clientes do escritorio com estabelecimentos (usado pela importacao para achar o cliente pelo CNPJ). */
export const loadAllForResolver = (officeId: string) =>
  prisma.client.findMany({ where: { officeId }, include: { establishments: true } });

export const createEstablishment = (data: { clientId: string; cnpj: string; label: string; isMatriz: boolean }) =>
  prisma.establishment.create({ data });