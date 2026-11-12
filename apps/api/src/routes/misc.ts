import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as ai from '../controllers/ai.js';
import * as auth from '../controllers/auth.js';
import * as notifications from '../controllers/notifications.js';

export async function miscRoutes(app: FastifyInstance) {
  app.get('/api/me', auth.me);
  app.post('/api/ia/ask', { preHandler: can('ia') }, ai.ask);
  app.get('/api/notifications', notifications.listNotifications);
}