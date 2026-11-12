import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { authRoutes } from './auth.js';
import { dashboardRoutes } from './dashboard.js';
import { noteRoutes } from './notes.js';
import { auditRoutes } from './audit.js';
import { uploadRoutes } from './uploads.js';
import { clientRoutes } from './clients.js';
import { adminRoutes } from './admin.js';
import { miscRoutes } from './misc.js';

/** Monta todas as rotas: as de sessao sao publicas; o resto exige token de acesso. */
export async function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authenticate);
    await protectedApp.register(dashboardRoutes);
    await protectedApp.register(noteRoutes);
    await protectedApp.register(auditRoutes);
    await protectedApp.register(uploadRoutes);
    await protectedApp.register(clientRoutes);
    await protectedApp.register(adminRoutes);
    await protectedApp.register(miscRoutes);
  });
}