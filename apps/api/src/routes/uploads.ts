import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as uploads from '../controllers/upload.js';
import * as sped from '../controllers/sped.js';

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', { preHandler: can('importar'), config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, uploads.createUploads);
  app.get('/api/uploads', { preHandler: can('importar') }, uploads.listUploads);
  app.get('/api/uploads/:id', { preHandler: can('importar') }, uploads.getUpload);
  // divergencias do SPED contra as notas importadas (so leitura)
  app.get('/api/sped', { preHandler: can('auditoria') }, sped.listSped);
  app.get('/api/sped/:id', { preHandler: can('auditoria') }, sped.getSped);
}