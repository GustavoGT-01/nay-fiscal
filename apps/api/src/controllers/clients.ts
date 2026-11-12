import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { cnpjValido, onlyDigits, REGIMES, type Regime } from '@nay/shared';
import { ownClient } from '../middleware/auth.js';
import * as clients from '../models/client.js';
import * as documents from '../models/document.js';
import * as notifications from '../models/notification.js';
import { lookupCnpj } from '../services/cnpj-lookup.js';

const regimeEnum = z.enum(REGIMES.map((r) => r.value) as [Regime, ...Regime[]]);

const clientInput = z.object({
  cnpj: z.string().transform(onlyDigits).refine(cnpjValido, 'CNPJ inválido. Confira os números.'),
  name: z.string().trim().min(2, 'Informe a razão social.').max(200),
  tradeName: z.string().trim().max(200).nullish(),
  regime: regimeEnum,
  city: z.string().trim().max(100).nullish(),
  cityCode: z.string().trim().regex(/^\d{7}$/, 'Código IBGE tem 7 dígitos.').nullish().or(z.literal('')),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF tem 2 letras.').nullish().or(z.literal('')),
  cnae: z.string().trim().max(20).nullish(),
});

const clean = (d: z.infer<typeof clientInput>) => ({
  name: d.name,
  tradeName: d.tradeName || null,
  regime: d.regime,
  city: d.city || null,
  cityCode: d.cityCode || null,
  uf: d.uf || null,
  cnae: d.cnae || null,
});

const labelFor = (cnpj: string, city: string | null) => (cnpj.slice(8, 12) === '0001' ? 'Matriz' : `Filial ${city ?? cnpj.slice(8, 12)}`);

export async function cnpjLookup(req: FastifyRequest, reply: FastifyReply) {
  const cnpj = onlyDigits((req.params as { cnpj: string }).cnpj);
  if (!cnpjValido(cnpj)) return reply.code(400).send({ message: 'CNPJ inválido. Confira os números.' });
  const data = await lookupCnpj(cnpj);
  if (!data) return reply.code(404).send({ message: 'CNPJ não encontrado na Receita. Preencha os dados à mão.' });
  return data;
}

export async function createClient(req: FastifyRequest, reply: FastifyReply) {
  const d = clientInput.parse(req.body);
  const same = await clients.findByCnpjRoot(req.me.officeId, d.cnpj.slice(0, 8));
  if (same) return reply.code(409).send({ message: `Já existe o cliente ${same.name} com esta raiz de CNPJ. Matriz e filiais ficam no mesmo cliente.` });
  const c = await clients.create({
    officeId: req.me.officeId, cnpj: d.cnpj, ...clean(d),
    establishments: { create: [{ cnpj: d.cnpj, label: labelFor(d.cnpj, d.city ?? null), isMatriz: d.cnpj.slice(8, 12) === '0001' }] },
  });
  return reply.code(201).send({ id: c.id });
}

export async function updateClient(req: FastifyRequest) {
  const client = await ownClient(req, (req.params as { id: string }).id);
  // o CNPJ nao muda: as notas ja importadas dependem dele
  const d = clientInput.omit({ cnpj: true }).parse(req.body);
  await clients.update(client.id, clean({ ...d, cnpj: client.cnpj }));
  return { ok: true };
}

export async function deleteClient(req: FastifyRequest, reply: FastifyReply) {
  const client = await ownClient(req, (req.params as { id: string }).id);
  const { confirm } = z.object({ confirm: z.string().optional() }).parse(req.body ?? {});
  if (confirm !== 'APAGAR') return reply.code(400).send({ message: 'Digite APAGAR para confirmar.' });
  const notes = await documents.countOfClient(client.id);
  await clients.remove(client.id); // notas, itens, achados e envios saem em cascata
  await notifications.create({ officeId: req.me.officeId, type: 'CLIENT_DELETED', title: 'Cliente excluído', message: `${req.me.name} excluiu ${client.name} e ${notes} nota(s).`, severity: 'INFO' });
  return { notes };
}