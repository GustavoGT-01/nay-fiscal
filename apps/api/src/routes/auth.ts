import type { FastifyInstance } from 'fastify';
import * as auth from '../controllers/auth.js';

// limite por IP alem do bloqueio por conta (services/login-guard.ts)
const loginLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const refreshLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } };

/** Rotas publicas de sessao. */
export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: loginLimit }, auth.login);
  app.post('/api/auth/refresh', { config: refreshLimit }, auth.refresh);
  app.post('/api/auth/logout', { config: refreshLimit }, auth.logout);
}
