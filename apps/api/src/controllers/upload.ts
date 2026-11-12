import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UploadDTO } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as uploads from '../models/upload.js';
import { processUpload } from '../services/ingest/process-upload.js';
import { xmlsFromZip } from '../services/ingest/zip.js';

const uploadDTO = (u: uploads.UploadWithClient): UploadDTO => ({
  id: u.id, fileName: u.fileName, kind: u.kind, status: u.status, total: u.total, processed: u.processed,
  okCount: u.okCount, errorCount: u.errorCount, skipped: u.skipped, message: u.message, createdAt: u.createdAt.toISOString(),
  clientName: u.client?.name ?? null, createdClients: JSON.parse(u.createdClients) as string[],
});

export async function createUploads(req: FastifyRequest, reply: FastifyReply) {
  const parts = req.parts();
  let clientId: string | undefined;
  const files: { name: string; buf: Buffer }[] = [];
  for await (const p of parts) {
    if (p.type === 'file') files.push({ name: p.filename, buf: await p.toBuffer() });
    else if (p.fieldname === 'clientId') clientId = String(p.value);
  }
  // sem clientId (ou "auto"): o cliente e detectado pelo CNPJ das notas e criado se faltar
  const client = clientId && clientId !== 'auto' ? await ownClient(req, clientId) : null;
  if (!client && !req.me.permissions.includes('clientes.gerenciar')) {
    return reply.code(403).send({ message: 'Escolha o cliente antes de importar. Seu perfil não cria clientes.' });
  }
  if (!files.length) return reply.code(400).send({ message: 'Escolha ao menos um arquivo.' });
  const created = [];
  for (const f of files) {
    const kind = /\.zip$/i.test(f.name) ? 'ZIP' : /\.txt$/i.test(f.name) ? 'SPED' : 'XML';
    const up = await uploads.create({ officeId: req.me.officeId, clientId: client?.id ?? null, fileName: f.name, kind });
    created.push(up);
    void (async () => {
      try {
        if (kind === 'SPED') throw new Error('Leitura de SPED chega numa próxima versão.');
        const xmls = kind === 'ZIP' ? await xmlsFromZip(f.buf) : [{ name: f.name, xml: f.buf.toString('utf8') }];
        await processUpload(up.id, xmls);
      } catch (e) {
        await uploads.update(up.id, { status: 'ERRO', message: (e as Error).message });
      }
    })();
  }
  return created;
}

export async function listUploads(req: FastifyRequest): Promise<UploadDTO[]> {
  const rows = await uploads.listOfOffice(req.me.officeId);
  return rows.map(uploadDTO);
}

export async function getUpload(req: FastifyRequest): Promise<UploadDTO> {
  const { id } = req.params as { id: string };
  return uploadDTO(await uploads.findOfOffice(id, req.me.officeId));
}
