/**
 * Bloqueio de forca bruta por conta (complementa o rate-limit por IP).
 * Depois de MAX_FAILS senhas erradas seguidas na mesma chave (e-mail e IP), ela fica bloqueada por LOCK_MS.
 * Guardado no banco: reiniciar a API nao zera o bloqueio, e a instancia do tunel enxerga o mesmo.
 * So o hash da chave e gravado (gente digita a senha no campo de e-mail).
 */
import { createHash } from 'node:crypto';
import * as session from '../models/session.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const WINDOW_MS = 15 * 60_000;

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

/** Milissegundos que faltam para liberar a chave (0 = liberada). */
export async function lockRemaining(key: string, now = Date.now()) {
  const e = await session.findAttempt(hash(key));
  const until = e?.lockedUntil?.getTime() ?? 0;
  return until > now ? until - now : 0;
}

export async function registerFailure(key: string, now = Date.now()) {
  // janela vencida sai antes de contar: a falha de hoje comeca uma contagem nova
  await session.dropStaleAttempts(new Date(now - WINDOW_MS), new Date(now));
  const k = hash(key);
  // dois pedidos criando a mesma entrada ao mesmo tempo: o segundo tenta de novo e so incrementa
  const e = await session.addFailure(k, new Date(now)).catch(() => session.addFailure(k, new Date(now)));
  if (e.fails >= MAX_FAILS) await session.lockAttempt(k, new Date(now + LOCK_MS));
}

export async function registerSuccess(key: string) {
  await session.removeAttempt(hash(key));
}

/** So para testes. */
export async function resetLoginGuard() {
  await session.clearAttempts();
}
