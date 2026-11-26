import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as notifications from '../models/notification.js';

export const listNotifications = async (req: FastifyRequest) => notifications.listFor(req.me.officeId, req.me.id);

const ReadBody = z.object({ ids: z.array(z.string().max(100)).max(50).optional() }).strict();

/** POST /api/notifications/read: sem `ids`, marca todos os avisos visiveis como lidos. */
export async function markRead(req: FastifyRequest) {
  const { ids } = ReadBody.parse(req.body ?? {});
  return { marked: await notifications.markRead(req.me.officeId, req.me.id, ids) };
}
