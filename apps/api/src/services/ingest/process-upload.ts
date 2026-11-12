import { activeRules } from '../../models/rule.js';
import * as clients from '../../models/client.js';
import * as documents from '../../models/document.js';
import * as uploads from '../../models/upload.js';
import { parseFiscalXml } from '../../xml/nfe-parser.js';
import { ClientResolver } from './client-resolver.js';
import { ingestXml } from './ingest-xml.js';
/**
 * Processa um envio (XML ou ZIP) em segundo plano.
 * - Com cliente escolhido: so aceita notas em que o cliente e emitente ou destinatario.
 * - Sem cliente (detectar): usa o cliente cadastrado que aparece na nota; se nenhum aparece,
 *   cria o cliente com a empresa que mais se repete no lote (a empresa dona das notas).
 */
export async function processUpload(uploadId: string, files: { name: string; xml: string }[]) {
  await activeRules(); // aquece
  const up = await uploads.update(uploadId, { total: files.length });
  const resolver = new ClientResolver(up.officeId);
  await resolver.load();
  const fixed = up.clientId ? await clients.findByIdOrNull(up.clientId) : null;

  // le tudo antes, para contar quais CNPJs mais aparecem no lote
  const parsed = files.map((f) => {
    try { return { f, p: parseFiscalXml(f.xml) }; } catch { return { f, p: null }; }
  });
  const freq = new Map<string, number>();
  for (const { p } of parsed) {
    if (p?.kind !== 'documento') continue;
    for (const c of new Set([p.emitter.cnpj.slice(0, 8), p.recipient.cnpj.slice(0, 8)])) if (c) freq.set(c, (freq.get(c) ?? 0) + 1);
  }

  let processed = 0, ok = 0, err = 0, failed = 0, skipped = 0;
  const notMine: string[] = [];
  const usedClients = new Map<string, number>();
  for (const { f, p } of parsed) {
    try {
      if (!p) { failed++; continue; }
      let clientId: string | undefined;
      if (p.kind === 'cancelamento') {
        const doc = await documents.findOwnerByKey(p.key, up.officeId);
        clientId = fixed?.id ?? doc?.clientId;
        if (!clientId) { skipped++; continue; }
      } else if (fixed) {
        const root = fixed.cnpj.slice(0, 8);
        const mine = [p.emitter, p.recipient].find((x) => x.cnpj.slice(0, 8) === root || resolver.find(x.cnpj)?.id === fixed.id);
        if (!mine) { skipped++; if (notMine.length < 3) notMine.push(f.name); continue; }
        await resolver.ensureEstablishment(mine);
        clientId = fixed.id;
      } else {
        const known = [p.emitter, p.recipient].find((x) => resolver.find(x.cnpj));
        if (known) {
          await resolver.ensureEstablishment(known);
          clientId = resolver.find(known.cnpj)!.id;
        } else {
          const fe = freq.get(p.emitter.cnpj.slice(0, 8)) ?? 0;
          const fr = p.recipient.cnpj.length === 14 ? freq.get(p.recipient.cnpj.slice(0, 8)) ?? 0 : -1;
          if (fe === fr || p.emitter.cnpj.length !== 14) { skipped++; continue; } // nao da para saber qual e a empresa
          const party = fe > fr ? p.emitter : p.recipient;
          clientId = (await resolver.create(party, party === p.emitter ? p.emitter.crt : null)).id;
        }
      }
      const r = await ingestXml(clientId, f.xml, uploadId);
      usedClients.set(clientId, (usedClients.get(clientId) ?? 0) + 1);
      if (r.status === 'erro') err++;
      else if (r.status) ok++;
    } catch {
      failed++;
    } finally {
      processed++;
      if (processed % 5 === 0 || processed === files.length) {
        await uploads.update(uploadId, { processed, okCount: ok, errorCount: err, skipped });
      }
    }
  }

  const msgs: string[] = [];
  if (failed) msgs.push(`${failed} arquivo(s) não reconhecido(s)`);
  if (skipped && fixed) msgs.push(`${skipped} nota(s) não são de ${fixed.name}${notMine.length ? ` (ex.: ${notMine.join(', ')})` : ''}`);
  else if (skipped) msgs.push(`${skipped} nota(s) sem cliente identificado: cadastre o cliente ou escolha-o antes de importar`);
  const mainClient = fixed?.id ?? [...usedClients].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  await uploads.update(uploadId, {
    status: 'CONCLUIDO', processed, okCount: ok, errorCount: err, skipped, clientId: mainClient,
    createdClients: JSON.stringify(resolver.created),
    message: msgs.length ? msgs.join('. ') : null,
  });
}
