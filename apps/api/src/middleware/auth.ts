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
  /** so no token de renovacao: identifica o token para a rotacao */
  jti?: string;
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

/** O que a pessoa com senha provisoria ainda pode chamar: saber quem e, definir a senha e sair. */
const LIBERADO_COM_SENHA_PROVISORIA = new Set(['/api/me', '/api/auth/change-password', '/api/auth/logout-all']);

/** preHandler: exige token de acesso valido e carrega o usuario. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
    if (req.user.typ !== 'access' || typeof req.user.ver !== 'number') throw new Error();
    req.me = await loadUser(req.user.sub, req.user.ver);
  } catch {
    return reply.code(401).send({ message: 'Sua sessão expirou. Entre de novo.' });
  }
  if (req.me.mustChangePassword && !LIBERADO_COM_SENHA_PROVISORIA.has(req.routeOptions.url ?? '')) {
    return reply.code(403).send({ message: 'Defina a sua senha antes de continuar.', code: 'TROCAR_SENHA' });
  }
}

/** preHandler: exige permissao de tela/acao. */
export const can = (perm: string) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.me?.permissions.includes(perm)) return reply.code(403).send({ message: 'Seu perfil não tem acesso a esta área.' });
};

/** preHandler: so administrador do escritorio (ADMIN ou OWNER). Quem tem apenas a tela Gestao no perfil so le. */
export async function adminOnly(req: FastifyRequest, reply: FastifyReply) {
  if (req.me?.role === 'ANALISTA') return reply.code(403).send({ message: 'Só administradores do escritório podem fazer isso.' });
}

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