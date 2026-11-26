import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IdParam } from '../lib/query.js';
import { ownClient } from '../middleware/auth.js';
import * as sped from '../models/sped.js';

const ListQuery = z.object({ clientId: z.string().min(1).max(100) });
const DetailQuery = z.object({
  kind: z.enum(['sem_xml', 'fora_do_sped', 'valor', 'icms', 'situacao', 'operacao']).optional(),
  page: z.coerce.number().int().min(0).max(100_000).default(0),
  size: z.coerce.number().int().min(1).max(200).default(50),
});

const fileDTO = (f: Awaited<ReturnType<typeof sped.listOfClient>>[number]) => ({
  id: f.id, fileName: f.fileName, cnpj: f.cnpj, periodStart: f.periodStart.toISOString(), periodEnd: f.periodEnd.toISOString(),
  entries: f.entries, ignored: f.ignored, divergenceCount: f.divergenceCount, createdAt: f.createdAt.toISOString(),
});

/** GET /api/sped?clientId: arquivos de SPED do cliente, do mais recente para o mais antigo. */
export async function listSped(req: FastifyRequest) {
  const { clientId } = ListQuery.parse(req.query);
  const client = await ownClient(req, clientId);
  return (await sped.listOfClient(client.id)).map(fileDTO);
}

/** GET /api/sped/:id: o arquivo, a contagem por tipo e uma pagina das divergencias. */
export async function getSped(req: FastifyRequest, reply: FastifyReply) {
  const { id } = IdParam.parse(req.params);
  const q = DetailQuery.parse(req.query);
  const file = await sped.findOfOffice(id, req.me.officeId);
  if (!file) return reply.code(404).send({ message: 'SPED não encontrado.' });
  const [kinds, [total, rows]] = await Promise.all([sped.countKinds(file.id), sped.divergencesPage(file.id, q.kind, q.page * q.size, q.size)]);
  return {
    file: fileDTO(file),
    kinds: Object.fromEntries(kinds.map((k) => [k.kind, k._count])),
    total,
    truncated: file.divergenceCount > sped.MAX_STORED_DIVERGENCES,
    rows: rows.map(({ id: rid, kind, key, number, documentId, sped: s, xml }) => ({ id: rid, kind, key, number, documentId, sped: s, xml })),
  };
}
