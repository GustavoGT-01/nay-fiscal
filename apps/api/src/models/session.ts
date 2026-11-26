import { prisma } from '../config/db.js';

/* ---------- Tokens de renovacao de sessao ---------- */

export const createRefresh = (data: { jti: string; userId: string; familyId: string; expiresAt: Date }) => prisma.refreshToken.create({ data });

export const findRefresh = (jti: string) => prisma.refreshToken.findUnique({ where: { jti } });

/** Marca como usado so se ainda nao foi: `count` 1 = este pedido ficou com o token. */
export const claimRefresh = (jti: string, usedAt: Date) => prisma.refreshToken.updateMany({ where: { jti, usedAt: null }, data: { usedAt } });

export const revokeFamily = (familyId: string) => prisma.refreshToken.deleteMany({ where: { familyId } });

export const revokeUser = (userId: string) => prisma.refreshToken.deleteMany({ where: { userId } });

export const dropExpired = (userId: string, now: Date) => prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: now } } });

/* ---------- Tentativas erradas de login ---------- */

export const findAttempt = (key: string) => prisma.loginAttempt.findUnique({ where: { key } });

/** Soma uma falha (cria a entrada na primeira). */
export const addFailure = (key: string, now: Date) =>
  prisma.loginAttempt.upsert({ where: { key }, create: { key, first: now }, update: { fails: { increment: 1 } } });

export const lockAttempt = (key: string, lockedUntil: Date) => prisma.loginAttempt.update({ where: { key }, data: { lockedUntil } });

export const removeAttempt = (key: string) => prisma.loginAttempt.deleteMany({ where: { key } });

/** Apaga as entradas cuja janela passou e que nao estao bloqueadas (a tabela nao cresce sem limite). */
export const dropStaleAttempts = (windowStart: Date, now: Date) =>
  prisma.loginAttempt.deleteMany({ where: { first: { lt: windowStart }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } });

export const clearAttempts = () => prisma.loginAttempt.deleteMany();
