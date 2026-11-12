import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as clients from '../controllers/clients.js';
import * as admin from '../controllers/admin.js';

export async function clientRoutes(app: FastifyInstance) {
  // consulta externa (BrasilAPI): limite para nao virar proxy de abuso
  app.get('/api/cnpj/:cnpj', { preHandler: can('clientes.gerenciar'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, clients.cnpjLookup);
  app.post('/api/clients', { preHandler: can('clientes.gerenciar') }, clients.createClient);
  app.patch('/api/clients/:id', { preHandler: can('clientes.gerenciar') }, clients.updateClient);
  app.delete('/api/clients/:id', { preHandler: can('dados.apagar') }, clients.deleteClient);
  app.delete('/api/clients/:id/documents', { preHandler: can('dados.apagar') }, admin.wipeClient);
}