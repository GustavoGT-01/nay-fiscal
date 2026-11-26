import * as clients from '../../models/client.js';
import * as sped from '../../models/sped.js';
import * as uploads from '../../models/upload.js';
import { rootsOf } from '../ingest/direction.js';
import { crossCheck, type DocLite } from './crosscheck.js';
import { decodeSped, parseSped } from './parse.js';

const cents = (v: bigint | number) => Number(v);

/** Le o SPED, cruza com as notas ja importadas e guarda as divergencias. So leitura: nada nas notas e alterado. */
export async function processSped(uploadId: string, fileName: string, buf: Buffer) {
  const up = await uploads.update(uploadId, { total: 0 });
  const parsed = parseSped(decodeSped(buf));
  const { header, entries } = parsed;

  // o cliente do envio, ou o cadastrado com o CNPJ do arquivo; nunca um cliente de outro CNPJ
  let client = up.clientId ? await clients.findWithEstablishmentsUnscoped(up.clientId) : null;
  if (!client) {
    const all = await clients.loadAllForResolver(up.officeId);
    client = all.find((c) => rootsOf(c).has(header.cnpj.slice(0, 8))) ?? null;
    if (!client) throw new Error(`Nenhum cliente do escritório tem o CNPJ ${header.cnpj} do SPED. Cadastre o cliente ou escolha-o no envio.`);
  }
  if (!rootsOf(client).has(header.cnpj.slice(0, 8))) {
    throw new Error(`O SPED é do CNPJ ${header.cnpj}, que não é do cliente ${client.name}. Escolha o cliente certo.`);
  }

  const to = new Date(header.end.getTime() + 24 * 3600_000 - 1); // ate o fim do ultimo dia
  const { noPeriodo, porChave } = await sped.docsForCheck(client.id, header.start, to, entries.map((e) => e.key));
  const lite = (d: { id: string; key: string; number: string; total: bigint; vIcms: bigint; direction: string; cancelled: boolean }): DocLite =>
    ({ id: d.id, key: d.key, number: d.number, totalCents: cents(d.total), icmsCents: cents(d.vIcms), direction: d.direction, cancelled: d.cancelled });
  const divergences = crossCheck(entries, new Map([...porChave].map(([k, d]) => [k, lite(d)])), noPeriodo.map(lite));

  const file = await sped.create({
    clientId: client.id, fileName, cnpj: header.cnpj, periodStart: header.start, periodEnd: header.end,
    entries: entries.length, ignored: parsed.ignored, divergences,
  });
  const notasComDivergencia = new Set(divergences.filter((d) => d.documentId || d.kind === 'sem_xml').map((d) => d.key)).size;
  await uploads.update(uploadId, {
    clientId: client.id, status: 'CONCLUIDO', total: entries.length, processed: entries.length,
    okCount: Math.max(0, entries.length - notasComDivergencia), errorCount: notasComDivergencia,
    message: divergences.length
      ? `${divergences.length} divergência(s) entre o SPED e as notas importadas.`
      : 'O SPED confere com as notas importadas.',
  });
  return file;
}
