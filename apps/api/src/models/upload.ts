import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';

const withClient = { client: { select: { name: true } } } satisfies Prisma.UploadInclude;
export type UploadWithClient = Prisma.UploadGetPayload<{ include: typeof withClient }>;

// envios do escritorio inteiro (um envio pode criar ou abastecer varios clientes)
const ofOffice = (officeId: string) => ({ OR: [{ officeId }, { client: { officeId } }] });

export const create = (data: { officeId: string; clientId: string | null; fileName: string; kind: string }) =>
  prisma.upload.create({ data });

export const update = (id: string, data: Prisma.UploadUpdateInput | Prisma.UploadUncheckedUpdateInput) =>
  prisma.upload.update({ where: { id }, data });

export const listOfOffice = (officeId: string) =>
  prisma.upload.findMany({ where: ofOffice(officeId), include: withClient, orderBy: { createdAt: 'desc' }, take: 30 });

export const findOfOffice = (id: string, officeId: string) =>
  prisma.upload.findFirstOrThrow({ where: { id, ...ofOffice(officeId) }, include: withClient });