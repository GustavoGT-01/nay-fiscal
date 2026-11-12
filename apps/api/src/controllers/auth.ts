import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { TokenPayload } from '../middleware/auth.js';
import * as users from '../models/user.js';
import { loadUser } from '../services/auth.js';
import { lockRemaining, registerFailure, registerSuccess } from '../services/login-guard.js';
import { clientIp } from '../services/client-ip.js';

/** Cookie httpOnly do refresh token: o JavaScript da pagina nunca le (XSS nao rouba a sessao). */
export const REFRESH_COOKIE = 'nay_rt';
const REFRESH_TTL_S = 7 * 24 * 3600;

// hash de uma senha qualquer: compara mesmo quando o e-mail nao existe (tempo de resposta igual)
const DUMMY_HASH = bcrypt.hashSync('nay-fiscal-dummy-password', 12); // mesmo custo do senha.ts

const BAD_LOGIN = 'E-mail ou senha incorretos.';

type SignUser = { id: string; officeId: string; role: string; tokenVersion: number };

const accessToken = (req: FastifyRequest, u: SignUser) =>
  req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'access', ver: u.tokenVersion }, { expiresIn: '15m' });

const isHttps = (req: FastifyRequest) => req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

function setRefreshCookie(req: FastifyRequest, reply: FastifyReply, u: SignUser) {
  const token = req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'refresh', ver: u.tokenVersion }, { expiresIn: REFRESH_TTL_S });
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
  const wait = lockRemaining(lockKey);
  if (wait > 0) {
    return reply.code(429).send({ message: `Muitas tentativas erradas. Tente de novo em ${Math.ceil(wait / 60_000)} min.` });
  }

  const u = await users.findByEmail(email);
  const ok = await bcrypt.compare(body.password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !u.active || !ok) {
    registerFailure(lockKey);
    // sem o e-mail no log: gente digita a senha no campo de e-mail
    req.log.warn({ ip: clientIp(req) }, 'login recusado');
    return reply.code(401).send({ message: BAD_LOGIN });
  }
  registerSuccess(lockKey);
  setRefreshCookie(req, reply, u);
  return { accessToken: accessToken(req, u), user: await loadUser(u.id) };
}

/** Troca o refresh token (cookie) por um novo token de acesso e gira o cookie. */
export async function refresh(req: FastifyRequest, reply: FastifyReply) {
  const raw = req.cookies[REFRESH_COOKIE];
  try {
    if (!raw) throw new Error();
    const p = req.server.jwt.verify<TokenPayload>(raw);
    if (p.typ !== 'refresh' || typeof p.ver !== 'number') throw new Error();
    const u = await users.findById(p.sub);
    if (!u.active || u.tokenVersion !== p.ver) throw new Error();
    setRefreshCookie(req, reply, u);
    return { accessToken: accessToken(req, u), user: await loadUser(u.id) };
  } catch {
    clearRefreshCookie(req, reply);
    return reply.code(401).send({ message: 'Sua sessão expirou. Entre de novo.' });
  }
}

/** Sai deste navegador (apaga o cookie). */
export async function logout(req: FastifyRequest, reply: FastifyReply) {
  clearRefreshCookie(req, reply);
  return { ok: true };
}

/** Sai de todos os aparelhos: invalida todos os tokens do usuario. */
export async function logoutAll(req: FastifyRequest, reply: FastifyReply) {
  await users.bumpTokenVersion(req.me.id);
  clearRefreshCookie(req, reply);
  return { ok: true };
}

export const me = async (req: FastifyRequest) => req.me;
