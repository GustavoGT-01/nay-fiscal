import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AdminClientSummaryDTO, AdminUserDTO, WipeResultDTO } from '@nay/shared';
import { prisma } from '../config/db.js';
import { ownClient } from '../middleware/auth.js';
import * as clients from '../models/client.js';
import * as documents from '../models/document.js';
import * as notifications from '../models/notification.js';
import * as users from '../models/user.js';
import { wipeClientData } from '../services/wipe.js';

const plural = (n: number) => (n === 1 ? '1 nota' : `${n} notas`);

async function notify(req: FastifyRequest, count: number, scope: string) {
  await notifications.create({
    officeId: req.me.officeId,
    type: 'DADOS_APAGADOS',
    title: 'Notas apagadas',
    message: `${req.me.name} apagou ${plural(count)} ${scope}.`,
    severity: 'WARN',
  });
}

/** Apaga uma nota (itens e achados vao junto). */
export async function deleteNote(req: FastifyRequest, reply: FastifyReply): Promise<WipeResultDTO | void> {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const doc = await documents.findForDelete(id, req.me.officeId);
  if (!doc) return reply.code(404).send({ message: 'Nota não encontrada.' });
  await documents.remove(doc.id);
  const label = doc.model === '57' ? 'CT-e' : doc.model === '65' ? 'NFC-e' : 'NF-e';
  await notify(req, 1, `(${label} ${doc.number})`);
  return { documents: 1, items: doc._count.items, findings: doc._count.findings, uploads: 0, auditRuns: 0 };
}

/** Apaga todas as notas, envios e auditorias de um cliente. */
export async function wipeClient(req: FastifyRequest): Promise<WipeResultDTO> {
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const client = await ownClient(req, id);
  const r = await wipeClientData(prisma, [client.id]);
  await notify(req, r.documents, `de ${client.name}`);
  return r;
}

/** Apaga todas as notas do escritorio. Exige { confirm: "APAGAR" }. */
export async function wipeOffice(req: FastifyRequest, reply: FastifyReply): Promise<WipeResultDTO | void> {
  const body = (req.body ?? {}) as { confirm?: unknown };
  if (body.confirm !== 'APAGAR') return reply.code(400).send({ message: 'Digite APAGAR para confirmar.' });
  const list = await clients.idsOfOffice(req.me.officeId);
  const r = await wipeClientData(prisma, list.map((c) => c.id));
  await notify(req, r.documents, 'de todos os clientes do escritório');
  return r;
}

/** Resumo por cliente para a tela de Gestao. */
export async function summary(req: FastifyRequest): Promise<AdminClientSummaryDTO[]> {
  const list = await clients.summaryOfOffice(req.me.officeId);
  return list.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj, notes: c._count.documents, uploads: c._count.uploads }));
}

/** Lista de usuarios do escritorio (somente leitura). */
export async function listUsers(req: FastifyRequest): Promise<AdminUserDTO[]> {
  const list = await users.listByOffice(req.me.officeId);
  return list.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role as AdminUserDTO['role'], active: u.active,
    profile: u.profile?.name ?? null, createdAt: u.createdAt.toISOString(),
  }));
}