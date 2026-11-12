import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserDTO } from '@nay/shared';
import * as clients from '../models/client.js';
import { loadUser } from '../services/auth.js';

export interface TokenPayload {
  sub: string;
  officeId: string;
  role: string;
  typ: 'access' | 'refresh';
  /** versao do token do usuario no momento da emissao (revogacao) */
  ver: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    me: UserDTO;
  }
}

/** preHandler: exige token de acesso valido e carrega o usuario. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    if (req.user.typ !== 'access' || typeof req.user.ver !== 'number') throw new Error();
    req.me = await loadUser(req.user.sub, req.user.ver);
  } catch {
    return reply.code(401).send({ message: 'Sua sessão expirou. Entre de novo.' });
  }
}

/** preHandler: exige permissao de tela/acao. */
export const can = (perm: string) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.me?.permissions.includes(perm)) return reply.code(403).send({ message: 'Seu perfil não tem acesso a esta área.' });
};

/** Garante que o cliente pertence ao escritorio do usuario. */
export async function ownClient(req: FastifyRequest, clientId: unknown) {
  // ?clientId=a&clientId=b vira array: recusa (antes chegava ao Prisma e dava 500)
  if (clientId !== undefined && (typeof clientId !== 'string' || clientId.length > 100)) {
    throw Object.assign(new Error('Cliente inválido.'), { statusCode: 400 });
  }
  if (!clientId) throw Object.assign(new Error('Escolha um cliente.'), { statusCode: 400 });
  const c = await clients.findOfOffice(clientId, req.me.officeId);
  if (!c) throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 });
  return c;
}