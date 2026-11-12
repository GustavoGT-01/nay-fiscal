import { prisma } from '../config/db.js';

export const findByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const findById = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

/** Usuario com escritorio e perfil (para montar permissoes). */
export const findWithOfficeAndProfile = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, include: { office: true, profile: true } });

export const listByOffice = (officeId: string) =>
  prisma.user.findMany({ where: { officeId }, include: { profile: true }, orderBy: { name: 'asc' } });