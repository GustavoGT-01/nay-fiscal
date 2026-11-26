/**
 * Rotacao do token de renovacao com deteccao de reuso. Cada login abre uma "familia"; cada renovacao
 * gasta o token e entrega outro da mesma familia. Se um token ja gasto reaparece, alguem tem uma copia:
 * a familia inteira e revogada (quem copiou e o dono precisam entrar de novo).
 */
import { randomUUID } from 'node:crypto';
import * as session from '../models/session.js';

export const REFRESH_TTL_S = 7 * 24 * 3600;
/** Duas abas renovando juntas mandam o mesmo cookie: dentro deste prazo o reuso e aceito. */
export const REUSE_GRACE_MS = 20_000;

/** Registra um token novo e devolve o identificador que vai dentro do JWT. */
export async function issueRefresh(userId: string, familyId: string = randomUUID(), now = Date.now()) {
  const jti = randomUUID();
  await session.dropExpired(userId, new Date(now));
  await session.createRefresh({ jti, userId, familyId, expiresAt: new Date(now + REFRESH_TTL_S * 1000) });
  return jti;
}

export type Consumed = { familyId: string } | { reused: boolean; familyId: null };

/** Gasta o token. Devolve a familia para emitir o proximo; `familyId` nulo = recusado. */
export async function consumeRefresh(jti: string, userId: string, now = Date.now()): Promise<Consumed> {
  const t = await session.findRefresh(jti);
  if (!t || t.userId !== userId || t.expiresAt.getTime() < now) return { reused: false, familyId: null };
  if ((await session.claimRefresh(jti, new Date(now))).count === 1) return { familyId: t.familyId };
  const used = (await session.findRefresh(jti))?.usedAt?.getTime();
  if (used !== undefined && now - used < REUSE_GRACE_MS) return { familyId: t.familyId };
  await session.revokeFamily(t.familyId);
  return { reused: true, familyId: null };
}

/** Sai deste aparelho: o token e os irmaos dele deixam de valer, mesmo que alguem tenha copiado o cookie. */
export async function revokeSessionOf(jti: string) {
  const t = await session.findRefresh(jti);
  if (t) await session.revokeFamily(t.familyId);
}

export const revokeAllSessions = (userId: string) => session.revokeUser(userId);
