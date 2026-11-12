import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as admin from '../controllers/admin.js';

/** Gestao de dados. Apagar e so para quem tem `dados.apagar` (ADMIN/OWNER). */
export async function adminRoutes(app: FastifyInstance) {
  app.delete('/api/data/documents', { preHandler: can('dados.apagar') }, admin.wipeOffice);
  app.get('/api/admin/summary', { preHandler: can('dados.apagar') }, admin.summary);
  app.get('/api/admin/users', { preHandler: can('gestao') }, admin.listUsers);
}