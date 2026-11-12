import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ownClient } from '../middleware/auth.js';
import { answerQuestion } from '../services/diagnostic.js';

export async function ask(req: FastifyRequest) {
  const b = z.object({ clientId: z.string(), question: z.string().min(1).max(500) }).parse(req.body);
  const client = await ownClient(req, b.clientId);
  return answerQuestion(client, b.question);
}