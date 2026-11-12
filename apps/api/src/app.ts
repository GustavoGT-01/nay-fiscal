import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { syncRules } from './models/rule.js';

/** Monta a API sem abrir porta (usado pelo server.ts e pelos testes). */
export async function buildApp() {
  if (!env.hasJwtSecret) console.warn('JWT_SECRET não definido: usando segredo de desenvolvimento.');

  const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 60 * 1024 * 1024 });

  await app.register(cors, { origin: env.webOrigin });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 20 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ message: 'Dados inválidos.', issues: err.issues });
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ message: code >= 500 ? 'Algo deu errado no servidor. Tente de novo.' : (err as Error).message });
  });

  await registerRoutes(app);
  await syncRules();
  return app;
}