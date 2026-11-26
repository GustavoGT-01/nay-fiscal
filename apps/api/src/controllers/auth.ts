import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { TokenPayload } from '../middleware/auth.js';
import * as users from '../models/user.js';
import { loadUser } from '../services/auth.js';
import { lockRemaining, registerFailure, registerSuccess } from '../services/login-guard.js';
import { consumeRefresh, issueRefresh, REFRESH_TTL_S, revokeAllSessions, revokeSessionOf } from '../services/refresh.js';
import { clientIp } from '../services/client-ip.js';
import { hashPassword, passwordProblem } from '../services/password.js';

/** Cookie httpOnly do refresh token: o JavaScript da pagina nunca le (XSS nao rouba a sessao). */
export const REFRESH_COOKIE = 'nay_rt';

// hash de uma senha qualquer: compara mesmo quando o e-mail nao existe (tempo de resposta igual)
const DUMMY_HASH = bcrypt.hashSync('nay-fiscal-dummy-password', 12); // mesmo custo do senha.ts

const BAD_LOGIN = 'E-mail ou senha incorretos.';

type SignUser = { id: string; officeId: string; role: string; tokenVersion: number };

const accessToken = (req: FastifyRequest, u: SignUser) =>
  req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'access', ver: u.tokenVersion }, { expiresIn: '15m' });

const isHttps = (req: FastifyRequest) => req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

/** Novo token de renovacao no cookie. Sem `familyId`, abre uma sessao (login); com ele, continua a mesma. */
async function setRefreshCookie(req: FastifyRequest, reply: FastifyReply, u: SignUser, familyId?: string) {
  const jti = await issueRefresh(u.id, familyId);
  const token = req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'refresh', ver: u.tokenVersion, jti }, { expiresIn: REFRESH_TTL_S });
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: isHttps(req), path: '/api/auth', maxAge: REFRESH_TTL_S,
  });
}

const clearRefreshCookie = (req: FastifyRequest, reply: FastifyReply) =>
  reply.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'strict', secure: isHttps(req), path: '/api/auth' });

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const body = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(200) }).parse(req.body);
  const email = body.email.toLowerCase();

  // bloqueio por (conta, IP): um atacante nao consegue trancar a conta de quem esta em outro IP
  const lockKey = `${email}|${clientIp(req)}`;
  const wait = await lockRemaining(lockKey);
  if (wait > 0) {
    return reply.code(429).send({ message: `Muitas tentativas erradas. Tente de novo em ${Math.ceil(wait / 60_000)} min.` });
  }

  const u = await users.findByEmail(email);
  const ok = await bcrypt.compare(body.password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !u.active || !ok) {
    await registerFailure(lockKey);
    // sem o e-mail no log: gente digita a senha no campo de e-mail
    req.log.warn({ ip: clientIp(req) }, 'login recusado');
    return reply.code(401).send({ message: BAD_LOGIN });
  }
  await registerSuccess(lockKey);
  await setRefreshCookie(req, reply, u);
  return { accessToken: accessToken(req, u), user: await loadUser(u.id) };
}

/** Troca o refresh token (cookie) por um novo token de acesso e gira o cookie. Token ja gasto derruba a sessao. */
export async function refresh(req: FastifyRequest, reply: FastifyReply) {
  const raw = req.cookies[REFRESH_COOKIE];
  try {
    if (!raw) throw new Error();
    const p = req.server.jwt.verify<TokenPayload>(raw);
    if (p.typ !== 'refresh' || typeof p.ver !== 'number' || typeof p.jti !== 'string') throw new Error();
    const u = await users.findById(p.sub);
    if (!u.active || u.tokenVersion !== p.ver) throw new Error();
    const used = await consumeRefresh(p.jti, u.id);
    if (used.familyId === null) {
      if (used.reused) req.log.warn({ ip: clientIp(req), userId: u.id }, 'token de renovacao reutilizado: sessao encerrada');
      throw new Error();
    }
    await setRefreshCookie(req, reply, u, used.familyId);
    return { accessToken: accessToken(req, u), user: await loadUser(u.id) };
  } catch {
    clearRefreshCookie(req, reply);
    return reply.code(401).send({ message: 'Sua sessão expirou. Entre de novo.' });
  }
}

/** Sai deste navegador: apaga o cookie e revoga a sessao (uma copia do cookie tambem deixa de valer). */
export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const raw = req.cookies[REFRESH_COOKIE];
  if (raw) {
    let jti: string | undefined;
    try { jti = req.server.jwt.verify<TokenPayload>(raw).jti; } catch { /* cookie vencido ou invalido: nada a revogar */ }
    if (jti) await revokeSessionOf(jti);
  }
  clearRefreshCookie(req, reply);
  return { ok: true };
}

/** Sai de todos os aparelhos: invalida todos os tokens do usuario. */
export async function logoutAll(req: FastifyRequest, reply: FastifyReply) {
  await users.bumpTokenVersion(req.me.id);
  await revokeAllSessions(req.me.id);
  clearRefreshCookie(req, reply);
  return { ok: true };
}

/**
 * Troca a propria senha (exige a atual). Encerra as outras sessoes e abre uma nova para quem trocou.
 * Tambem e o caminho do "primeiro acesso": a senha que o administrador definiu deixa de valer.
 */
export async function changePassword(req: FastifyRequest, reply: FastifyReply) {
  const b = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }).strict().parse(req.body);
  const u = await users.findById(req.me.id);
  if (!(await bcrypt.compare(b.current, u.passwordHash))) return reply.code(400).send({ message: 'A senha atual está incorreta.' });
  const bad = passwordProblem(b.next);
  if (bad) return reply.code(400).send({ message: bad });
  if (b.next === b.current) return reply.code(400).send({ message: 'A nova senha precisa ser diferente da atual.' });
  const updated = await users.setPassword(u.id, await hashPassword(b.next));
  await revokeAllSessions(u.id);
  await setRefreshCookie(req, reply, updated);
  return { accessToken: accessToken(req, updated), user: await loadUser(updated.id) };
}

export const me =async (req: FastifyRequest) => req.me;
