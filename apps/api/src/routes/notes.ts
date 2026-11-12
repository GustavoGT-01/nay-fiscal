import type { FastifyInstance } from 'fastify';
import { can } from '../middleware/auth.js';
import * as notes from '../controllers/notes.js';
import * as nfse from '../controllers/nfse.js';
import * as pdf from '../controllers/pdf.js';
import * as admin from '../controllers/admin.js';

export async function noteRoutes(app: FastifyInstance) {
  app.get('/api/notes', { preHandler: can('notas') }, notes.listNotes);
  app.get('/api/nfse/summary', { preHandler: can('nfse') }, nfse.summary);
  app.get('/api/notes/:id', { preHandler: can('notas') }, notes.getNote);
  app.get('/api/notes/:id/pdf.html', { preHandler: can('notas') }, pdf.noteHtml);
  app.delete('/api/notes/:id', { preHandler: can('dados.apagar') }, admin.deleteNote);
}