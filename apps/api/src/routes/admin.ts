import type { FastifyInstance } from 'fastify';
import { adminOnly, can } from '../middleware/auth.js';
import * as admin from '../controllers/admin.js';
import * as team from '../controllers/team.js';

/**
 * Gestao. Apagar dados e so para quem tem `dados.apagar` (ADMIN/OWNER).
 * Ver usuarios e perfis exige a tela `gestao`; criar e alterar, ser administrador do escritorio
 * (senao um analista com a tela Gestao daria a si mesmo todas as permissoes).
 */
export async function adminRoutes(app: FastifyInstance) {
  app.delete('/api/data/documents', { preHandler: can('dados.apagar') }, admin.wipeOffice);
  app.get('/api/admin/summary', { preHandler: can('dados.apagar') }, admin.summary);

  app.get('/api/admin/users', { preHandler: can('gestao') }, team.listUsers);
  app.post('/api/admin/users', { preHandler: [can('gestao'), adminOnly] }, team.createUser);
  app.patch('/api/admin/users/:id', { preHandler: [can('gestao'), adminOnly] }, team.updateUser);

  app.get('/api/admin/profiles', { preHandler: can('gestao') }, team.listProfiles);
  app.post('/api/admin/profiles', { preHandler: [can('gestao'), adminOnly] }, team.createProfile);
  app.put('/api/admin/profiles/:id', { preHandler: [can('gestao'), adminOnly] }, team.updateProfile);
  app.delete('/api/admin/profiles/:id', { preHandler: [can('gestao'), adminOnly] }, team.deleteProfile);
}
