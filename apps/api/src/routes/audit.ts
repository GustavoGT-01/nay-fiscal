import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as audit from '../controllers/audit.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get('/api/audit/rules', { preHandler: can('auditoria') }, audit.ruleGroups);
  app.get('/api/audit/suppliers', { preHandler: can('auditoria') }, audit.supplierGroups);
  app.post('/api/audit/run', { preHandler: [can('auditoria'), can('auditoria.rodar')] }, audit.runAudit);
  app.get('/api/audit/runs/:id', { preHandler: can('auditoria') }, audit.getRun);
  app.get('/api/audit/export', { preHandler: can('auditoria') }, audit.exportReport);
}