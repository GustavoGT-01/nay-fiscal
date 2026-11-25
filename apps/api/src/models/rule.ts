import type { Rule } from '@prisma/client';
import { prisma } from '../config/db.js';
import type { RuleSeed } from '../engine/catalog.js';
import { safeJson } from '../lib/json.js';

export function toRuleSeed(r: Rule): RuleSeed {
  return {
    code: r.code,
    field: r.field,
    title: r.title,
    kind: r.kind as RuleSeed['kind'],
    mode: r.mode,
    state: r.state as RuleSeed['state'],
    severity: r.severity as RuleSeed['severity'],
    definition: safeJson<Record<string, unknown>>(r.definition, {}),
    description: r.description,
    what: r.what,
    why: r.why,
    how: r.how,
    fixTag: r.fixTag,
    legalBasis: r.legalBasis,
    action: r.action as RuleSeed['action'],
  };
}

/**
 * Mantem a tabela de regras igual ao catalogo do codigo (cria regras novas e atualiza textos),
 * sem mexer no campo `active` que o escritorio pode ter desligado. Roda ao subir a API.
 */
export async function syncRules() {
  const { RULES } = await import('../engine/catalog.js');
  for (const r of RULES) {
    const data = { ...r, definition: JSON.stringify(r.definition) };
    await prisma.rule.upsert({ where: { code: r.code }, create: data, update: data });
  }
  invalidateRules();
  return RULES.length;
}

/**
 * As regras mudam so quando a API sobe (syncRules); ler a tabela inteira e converter o JSON de cada uma
 * a cada requisicao era trabalho repetido. Guarda o resultado por pouco tempo: uma edicao feita direto no
 * banco aparece em ate TTL_MS, e syncRules invalida na hora.
 */
const TTL_MS = 30_000;
let cache: { at: number; all: Map<string, Rule>; active: RuleSeed[] } | null = null;

export const invalidateRules = () => {
  cache = null;
};

async function loaded() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = await prisma.rule.findMany();
  cache = { at: Date.now(), all: new Map(rows.map((r) => [r.code, r])), active: rows.filter((r) => r.active).map(toRuleSeed) };
  return cache;
}

/** Regras ativas. A lista e compartilhada: quem chama so le. */
export async function activeRules(): Promise<RuleSeed[]> {
  return (await loaded()).active;
}

/** Todas as regras (ativas ou nao) indexadas pelo codigo. So leitura. */
export async function ruleMap() {
  return (await loaded()).all;
}