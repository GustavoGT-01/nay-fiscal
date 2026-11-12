import type { FastifyInstance } from 'fastify';
import * as auth from '../controllers/auth.js';

/** Rotas publicas de sessao. */
export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', auth.login);
  app.post('/api/auth/refresh', auth.refresh);
}