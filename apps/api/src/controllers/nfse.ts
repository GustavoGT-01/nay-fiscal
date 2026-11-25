import type { FastifyRequest } from 'fastify';
import type { NfseSummaryDTO } from '@nay/shared';
import type { NfseData } from '../xml/nfse-parser.js';
import { ScopeQuery } from '../lib/query.js';
import { ownClient } from '../middleware/auth.js';
import * as documents from '../models/document.js';
import { directionWhere, periodWhere } from '../services/filters.js';
import { safeJson } from '../lib/json.js';

/** NFS-e: totais de servico e ISS. */
export async function summary(req: FastifyRequest): Promise<NfseSummaryDTO> {
  const q = ScopeQuery.parse(req.query);
  const client = await ownClient(req, q.clientId);
  const docs = await documents.listNfseForSummary({ clientId: client.id, model: 'NFSE', status: { not: 'cancelada' }, ...directionWhere(q.direction), ...periodWhere(q) });
  const s: NfseSummaryDTO = { notes: docs.length, withError: 0, serviceValue: 0, issValue: 0, issRetained: 0, federalRetained: 0, prestadas: 0, tomadas: 0 };
  for (const d of docs) {
    const n = safeJson<NfseData | null>(d.nfse, null);
    if (d.status === 'erro') s.withError++;
    if (d.direction === 'saida') s.prestadas++; else s.tomadas++;
    if (!n) continue;
    s.serviceValue += n.serviceValue;
    s.issValue += n.issValue;
    if (n.issRetention === '2' || n.issRetention === '3') s.issRetained += n.issValue;
    s.federalRetained += n.retPis + n.retCofins + n.retIrrf + n.retCsll + n.retCp;
  }
  return s;
}