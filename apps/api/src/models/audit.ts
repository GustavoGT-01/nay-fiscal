import { prisma } from '../config/db.js';

/** Rodadas de auditoria (AuditRun). */
export const createRun = (clientId: string, total: number) => prisma.auditRun.create({ data: { clientId, total } });

export const updateRun = (id: string, data: { processed?: number; status?: string; finishedAt?: Date }) =>
  prisma.auditRun.update({ where: { id }, data });

export const findRunning = (clientId: string) => prisma.auditRun.findFirst({ where: { clientId, status: 'RODANDO' }, select: { id: true } });

export const findRunOfOffice = (id: string, officeId: string) =>
  prisma.auditRun.findFirstOrThrow({ where: { id, client: { officeId } } });