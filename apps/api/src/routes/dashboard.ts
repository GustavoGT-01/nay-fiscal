import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as dashboard from '../controllers/dashboard.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/clients', dashboard.listClients);
  app.get('/api/dashboard', { preHandler: can('inicio') }, dashboard.dashboard);
}