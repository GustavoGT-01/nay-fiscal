import { prisma } from '../config/db.js';

export const findByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const findById = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

export const findByIdOrNull = (id: string) => prisma.user.findUnique({ where: { id } });

/** Usuario com escritorio e perfil (para montar permissoes). */
export const findWithOfficeAndProfile = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, include: { office: true, profile: true } });

export const listByOffice = (officeId: string) =>
  prisma.user.findMany({ where: { officeId }, include: { profile: true }, orderBy: { name: 'asc' } });
/** Usuario do escritorio (nunca de outro). */
export const findOfOffice = (id: string, officeId: string) => prisma.user.findFirst({ where: { id, officeId } });

export const create = (data: { officeId: string; name: string; email: string; passwordHash: string; role: string; profileId: string | null }) =>
  prisma.user.create({ data: { ...data, mustChangePassword: true }, include: { profile: true } });

export const update = (id: string, data: { name?: string; role?: string; profileId?: string | null; active?: boolean; passwordHash?: string; mustChangePassword?: boolean }) =>
  prisma.user.update({ where: { id }, data, include: { profile: true } });

/** Define a senha do proprio usuario e encerra as outras sessoes (tokenVersion + 1). */
export const setPassword = (id: string, passwordHash: string) =>
  prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } } });

/** Invalida todos os tokens ja emitidos para o usuario (troca de senha, "sair de todos"). */
export const bumpTokenVersion = (id: string) =>
  prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
