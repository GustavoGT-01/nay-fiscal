import { prisma } from '../config/db.js';

export const create = (data: { officeId: string; type: string; title: string; message: string; severity: string }) =>
  prisma.notification.create({ data });

export const listFor = (officeId: string, userId: string) =>
  prisma.notification.findMany({ where: { officeId, OR: [{ userId: null }, { userId }] }, orderBy: { createdAt: 'desc' }, take: 15 });