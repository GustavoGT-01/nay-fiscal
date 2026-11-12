import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { TokenPayload } from '../middleware/auth.js';
import * as users from '../models/user.js';
import { loadUser } from '../services/auth.js';

const sign = (req: FastifyRequest, u: { id: string; officeId: string; role: string }) => ({
  accessToken: req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'access' }, { expiresIn: '15m' }),
  refreshToken: req.server.jwt.sign({ sub: u.id, officeId: u.officeId, role: u.role, typ: 'refresh' }, { expiresIn: '7d' }),
});

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await users.findByEmail(body.email.toLowerCase());
  if (!u || !u.active || !(await bcrypt.compare(body.password, u.passwordHash))) {
    return reply.code(401).send({ message: 'E-mail ou senha incorretos.' });
  }
  return { ...sign(req, u), user: await loadUser(u.id) };
}

export async function refresh(req: FastifyRequest, reply: FastifyReply) {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  try {
    const p = req.server.jwt.verify<TokenPayload>(refreshToken);
    if (p.typ !== 'refresh') throw new Error();
    const u = await users.findById(p.sub);
    if (!u.active) throw new Error();
    return sign(req, u);
  } catch {
    return reply.code(401).send({ message: 'Sua sessão expirou. Entre de novo.' });
  }
}

export const me = async (req: FastifyRequest) => req.me;