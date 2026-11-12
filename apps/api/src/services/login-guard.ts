/**
 * Bloqueio de forca bruta por conta (complementa o rate-limit por IP).
 * Depois de MAX_FAILS senhas erradas seguidas no mesmo e-mail, a conta fica
 * bloqueada por LOCK_MS. Em memoria: reinicia junto com a API (aceitavel para uma instancia).
 */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

interface Entry { fails: number; first: number; lockedUntil: number }
const byEmail = new Map<string, Entry>();

/** Milissegundos que faltam para liberar a conta (0 = liberada). */
export function lockRemaining(email: string, now = Date.now()) {
  const e = byEmail.get(email);
  if (!e) return 0;
  if (e.lockedUntil > now) return e.lockedUntil - now;
  if (now - e.first > WINDOW_MS) byEmail.delete(email);
  return 0;
}

export function registerFailure(email: string, now = Date.now()) {
  if (byEmail.size >= MAX_TRACKED && !byEmail.has(email)) {
    // evita crescer sem limite: descarta a entrada mais antiga
    const oldest = byEmail.keys().next().value;
    if (oldest !== undefined) byEmail.delete(oldest);
  }
  const e = byEmail.get(email);
  if (!e || now - e.first > WINDOW_MS) {
    byEmail.set(email, { fails: 1, first: now, lockedUntil: 0 });
    return;
  }
  e.fails++;
  if (e.fails >= MAX_FAILS) e.lockedUntil = now + LOCK_MS;
}

export function registerSuccess(email: string) {
  byEmail.delete(email);
}

/** So para testes. */
export function resetLoginGuard() {
  byEmail.clear();
}
