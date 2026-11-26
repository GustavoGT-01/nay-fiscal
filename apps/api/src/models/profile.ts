import { prisma } from '../config/db.js';

export const listOfOffice = (officeId: string) =>
  prisma.profile.findMany({ where: { officeId }, include: { _count: { select: { users: true } } }, orderBy: { name: 'asc' } });

export const findOfOffice = (id: string, officeId: string) =>
  prisma.profile.findFirst({ where: { id, officeId }, include: { _count: { select: { users: true } } } });

export const nameTaken = async (officeId: string, name: string, exceptId?: string) => {
  const all = await prisma.profile.findMany({ where: { officeId }, select: { id: true, name: true } });
  return all.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
};

export const create = (officeId: string, name: string, permissions: string[]) =>
  prisma.profile.create({ data: { officeId, name, permissions: JSON.stringify(permissions) }, include: { _count: { select: { users: true } } } });

export const update = (id: string, data: { name?: string; permissions?: string[] }) =>
  prisma.profile.update({
    where: { id },
    data: { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.permissions ? { permissions: JSON.stringify(data.permissions) } : {}) },
    include: { _count: { select: { users: true } } },
  });

export const remove = (id: string) => prisma.profile.delete({ where: { id } });
