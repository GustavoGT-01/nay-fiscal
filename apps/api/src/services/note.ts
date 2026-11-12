import type { FindingDTO } from '@nay/shared';
import * as documents from '../models/document.js';
import { ruleMap } from '../models/rule.js';
import { presentFinding } from './present.js';
import { SEV_ORDER } from './filters.js';

/** Carrega a nota (do escritorio) com itens e verificacoes apresentadas. OKs repetidos por item viram uma linha so. */
export async function loadNote(id: string, officeId: string) {
  const d = await documents.findFullOfOffice(id, officeId);
  if (!d) return null;
  const rules = await ruleMap();
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const checks = d.findings
    .map((f) => presentFinding(f, rules.get(f.ruleCode), f.itemId ? itemById.get(f.itemId) ?? null : null, d))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.itemNumber ?? 0) - (b.itemNumber ?? 0));
  const seen = new Set<string>();
  const compact: FindingDTO[] = checks.filter((c) => {
    if (c.severity !== 'ok') return true;
    const k = c.ruleCode ?? c.field;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { doc: d, checks: compact };
}