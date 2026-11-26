import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as notifications from '../models/notification.js';

/** Avisos que citam notas ou clientes: basta uma das permissoes para ver. Tipo fora da lista vale para todos. */
const QUEM_VE: Record<string, string[]> = {
  DADOS_APAGADOS: ['notas', 'gestao'],
  NOTAS_ALTERADAS: ['notas', 'importar', 'gestao'],
  CLIENT_DELETED: ['clientes', 'gestao'],
};
const hiddenTypes = (permissions: string[]) => Object.keys(QUEM_VE).filter((t) => !QUEM_VE[t]!.some((p) => permissions.includes(p)));

export const listNotifications = async (req: FastifyRequest) => notifications.listFor(req.me.officeId, req.me.id, hiddenTypes(req.me.permissions));

const ReadBody = z.object({ ids: z.array(z.string().max(100)).max(50).optional() }).strict();

/** POST /api/notifications/read: sem `ids`, marca todos os avisos visiveis como lidos. */
export async function markRead(req: FastifyRequest) {
  const { ids } = ReadBody.parse(req.body ?? {});
  return { marked: await notifications.markRead(req.me.officeId, req.me.id, ids, hiddenTypes(req.me.permissions)) };
}
