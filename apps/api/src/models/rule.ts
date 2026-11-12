import type { Rule } from '@prisma/client';
import { prisma } from '../config/db.js';
import type { RuleSeed } from '../engine/catalog.js';

export function toRuleSeed(r: Rule): RuleSeed {
  return {
    code: r.code,
    field: r.field,
    title: r.title,
    kind: r.kind as RuleSeed['kind'],
    mode: r.mode,
    state: r.state as RuleSeed['state'],
    severity: r.severity as RuleSeed['severity'],
    definition: JSON.parse(r.definition),
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
  return RULES.length;
}

export async function activeRules(): Promise<RuleSeed[]> {
  const rows = await prisma.rule.findMany({ where: { active: true } });
  return rows.map(toRuleSeed);
}

/** Todas as regras (ativas ou nao) indexadas pelo codigo. */
export async function ruleMap() {
  const rules = await prisma.rule.findMany();
  return new Map(rules.map((r) => [r.code, r]));
}