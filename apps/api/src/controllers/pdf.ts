import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadNote } from '../services/note.js';
import { renderNoteHtml } from '../views/pdf/note.js';

/** Nota em HTML A4 com o diagnostico, pronta para imprimir ou salvar em PDF. */
export async function noteHtml(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const loaded = await loadNote(id, req.me.officeId);
  if (!loaded) return reply.code(404).send({ message: 'Nota não encontrada.' });
  return reply
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Cache-Control', 'no-store')
    .send(renderNoteHtml(loaded));
}