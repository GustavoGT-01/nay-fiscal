import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UploadDTO } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as uploads from '../models/upload.js';
import { processUpload } from '../services/ingest/process-upload.js';
import { xmlsFromZip } from '../services/ingest/zip.js';
import { MAX_UPLOAD_TOTAL_BYTES, MAX_XML_BYTES } from '../services/ingest/limits.js';

/**
 * Fila unica de importacao: um arquivo por vez no processo inteiro. Sem isso, varios ZIPs
 * enviados juntos descompactavam em paralelo e podiam esgotar a memoria.
 */
let queue: Promise<void> = Promise.resolve();
let queuedBytes = 0;
const MAX_QUEUED_BYTES = 200 * 1024 * 1024; // arquivos esperando na fila (memoria)
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job, job);
  return queue;
};

const tooBig = (msg: string) => Object.assign(new Error(msg), { statusCode: 413 });
// nome so para exibir: sem caminho, sem caracteres de controle, tamanho limitado
const safeName = (n: string) => (n.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'arquivo';

const uploadDTO = (u: uploads.UploadWithClient): UploadDTO => ({
  id: u.id, fileName: u.fileName, kind: u.kind, status: u.status, total: u.total, processed: u.processed,
  okCount: u.okCount, errorCount: u.errorCount, skipped: u.skipped, message: u.message, createdAt: u.createdAt.toISOString(),
  clientName: u.client?.name ?? null, createdClients: JSON.parse(u.createdClients) as string[],
});

export async function createUploads(req: FastifyRequest, reply: FastifyReply) {
  const parts = req.parts();
  let clientId: string | undefined;
  const files: { name: string; buf: Buffer }[] = [];
  let total = 0;
  for await (const p of parts) {
    if (p.type === 'file') {
      const buf = await p.toBuffer(); // estoura com 413 acima de MAX_UPLOAD_FILE_BYTES
      total += buf.length;
      if (total > MAX_UPLOAD_TOTAL_BYTES) throw tooBig(`O envio passa de ${MAX_UPLOAD_TOTAL_BYTES / 1024 / 1024} MB. Envie em partes.`);
      files.push({ name: safeName(p.filename), buf });
    } else if (p.fieldname === 'clientId') clientId = String(p.value).slice(0, 100);
  }
  // sem clientId (ou "auto"): o cliente e detectado pelo CNPJ das notas e criado se faltar
  const client = clientId && clientId !== 'auto' ? await ownClient(req, clientId) : null;
  if (!client && !req.me.permissions.includes('clientes.gerenciar')) {
    return reply.code(403).send({ message: 'Escolha o cliente antes de importar. Seu perfil não cria clientes.' });
  }
  if (!files.length) return reply.code(400).send({ message: 'Escolha ao menos um arquivo.' });
  if (queuedBytes + total > MAX_QUEUED_BYTES) {
    return reply.code(503).header('Retry-After', '60').send({ message: 'Há muitas importações na fila. Tente de novo em alguns minutos.' });
  }
  queuedBytes += total;
  const created = [];
  for (const f of files) {
    const kind = /\.zip$/i.test(f.name) ? 'ZIP' : /\.txt$/i.test(f.name) ? 'SPED' : 'XML';
    const up = await uploads.create({ officeId: req.me.officeId, clientId: client?.id ?? null, fileName: f.name, kind });
    created.push(up);
    void enqueue(async () => {
      try {
        queuedBytes -= f.buf.length;
        if (kind === 'SPED') throw new Error('Leitura de SPED chega numa próxima versão.');
        if (kind === 'XML' && f.buf.length > MAX_XML_BYTES) throw new Error('Arquivo grande demais para um XML fiscal.');
        const xmls = kind === 'ZIP' ? await xmlsFromZip(f.buf) : [{ name: f.name, xml: f.buf.toString('utf8') }];
        await processUpload(up.id, xmls);
      } catch (e) {
        req.log.warn({ err: e, uploadId: up.id }, 'falha ao processar envio');
        await uploads.update(up.id, { status: 'ERRO', message: String((e as Error).message ?? 'Falha ao processar.').slice(0, 300) }).catch(() => {});
      }
    });
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
