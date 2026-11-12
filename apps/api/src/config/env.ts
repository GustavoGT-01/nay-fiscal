import { randomBytes } from 'node:crypto';

/** Segredos publicos (README, .env.example, codigo antigo): nunca podem assinar tokens. */
const WEAK_SECRETS = new Set(['', 'troque-este-segredo', 'dev-secret-nay-fiscal', 'secret', 'changeme']);
const MIN_SECRET = 32;

let ephemeral: string | null = null;

/** O segredo do .env so vale se for forte; senao usa um aleatorio que dura ate a API reiniciar. */
function resolveSecret() {
  const s = process.env.JWT_SECRET?.trim() ?? '';
  if (s.length >= MIN_SECRET && !WEAK_SECRETS.has(s)) return s;
  ephemeral ??= randomBytes(48).toString('hex');
  return ephemeral;
}

/** Configuracao lida do ambiente. Os padroes servem para desenvolvimento local. */
export const env = {
  get jwtSecret() {
    return resolveSecret();
  },
  /** true quando o .env tem um segredo forte (as sessoes sobrevivem a reinicios da API). */
  get hasStrongJwtSecret() {
    const s = process.env.JWT_SECRET?.trim() ?? '';
    return s.length >= MIN_SECRET && !WEAK_SECRETS.has(s);
  },
  /** Origem do front liberada no CORS. Nunca "qualquer origem". */
  get webOrigin(): string[] {
    return (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
  },
  // API_PORT (e nao PORT): ferramentas de preview definem PORT para o front.
  get port() {
    return Number(process.env.API_PORT ?? 3333);
  },
  /** SERVE_WEB=1: a API tambem entrega o front ja compilado (apps/web/dist). Usado pelo tunel. */
  get serveWeb() {
    return process.env.SERVE_WEB === '1';
  },
  get isTest() {
    return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  },
};
