import { accessKeyDv, type ParsedDocument, type ParsedItem } from '../xml/nfe-parser.js';
import type { RuleSeed } from './catalog.js';
import { actionFor } from './actions.js';
import { auditNfse } from './evaluator-nfse.js';
import { INICIO_REFORMA, type ClientContext, type EngineFinding, type FindingSeverity } from './types.js';

export type { ClientContext, EngineFinding, FindingSeverity } from './types.js';

type Ctx = Record<string, string | null>;

function itemContext(doc: ParsedDocument, it: ParsedItem): Ctx {
  const informed = it.pIbs > 0 || it.vIbs > 0 || it.pCbs > 0 || it.vCbs > 0;
  return {
    cfop: it.cfop || null,
    cclass_trib: it.cClassTrib,
    valores_ibs_cbs: informed ? 'informado' : 'ausente',
    cst_ibs_cbs: it.cstIbsCbs,
    tabela_icms: it.icmsTable,
    cst_pis: it.cstPis,
    cst_cofins: it.cstCofins,
    ncm: it.ncm || null,
    crt_emitente: doc.emitter.crt,
  };
}

/** Avalia uma regra tributaria sobre um item. Retorna null quando a regra nao se aplica. */
function evalItemRule(rule: RuleSeed, ctx: Ctx): Omit<EngineFinding, 'ruleCode' | 'field' | 'kind' | 'itemN'> | null {
  const def = rule.definition as any;
  const value = ctx[rule.field];
  const div = (observed: string, expected: string, divergent: boolean) => ({
    severity: (divergent ? rule.severity : 'ok') as FindingSeverity,
    observed,
    expected,
  });

  switch (rule.mode) {
    case 'mapa_por_cfop': {
      const cfop = ctx.cfop;
      if (!cfop || !(cfop in def.mapa)) return null;
      const expected = def.mapa[cfop] as string;
      if (def.exigir === 'ausencia') return div(value ?? 'ausente', 'ausente', value === 'informado');
      return div(value ?? 'ausente', expected, value !== expected);
    }
    case 'cobertura': {
      const cfop = ctx.cfop;
      if (!cfop || (def.conhecidos as string[]).includes(cfop)) return null;
      // achado nao divergente: lacuna para o especialista
      return { severity: 'a_verificar', observed: cfop, expected: 'regra definida' };
    }
    case 'formato': {
      if (!value) return null;
      return div(value, 'formato ' + def.regex, !new RegExp(def.regex).test(value));
    }
    case 'prefixo_igual_a_campo': {
      const ref = ctx[def.campoPrefixo];
      if (!value || !ref) return null;
      return div(value, ref, value.slice(0, def.tamanho) !== ref);
    }
    case 'dominio_condicionado': {
      const cond = ctx[def.condicao.campo];
      if (!cond || !(def.condicao.em as string[]).includes(cond) || !value) return null;
      const hit = (def.proibido as string[]).includes(value);
      return div(value, 'nenhum de: ' + (def.proibido as string[]).join(', '), hit);
    }
    case 'mapa_por_ncm': {
      const ncm = ctx.ncm;
      if (!ncm || !def.mapa?.[ncm]) return null;
      const aceitos = def.mapa[ncm] as string[];
      return div(value ?? 'ausente', aceitos.join(' ou '), !value || !aceitos.includes(value));
    }
    default:
      return null;
  }
}

export type EntradaVerdict = 'pode_creditar' | 'credito_em_risco' | 'nao_creditar';
export type SaidaVerdict = 'correta' | 'corrigir' | 'cancelar_reemitir' | 'cancelada';
export type Verdict = EntradaVerdict | SaidaVerdict;

/**
 * Veredito da nota para quem pergunta.
 * Entrada: posso tomar credito de IBS/CBS? Saida: estou emitindo certo?
 * `status` e o da auditoria; `cStat` ausente ou fora de 100/150 conta como nao autorizada.
 */
export function verdictFor(
  direction: string,
  status: string,
  findings: { ruleCode: string; severity: string; observed?: string }[],
  rules: Pick<RuleSeed, 'code' | 'action'>[],
): Verdict {
  const naoAutorizada = findings.some((f) => f.ruleCode === 'situacao-sefaz' && f.severity !== 'ok');
  const erros = findings.filter((f) => f.severity === 'erro');
  if (direction === 'entrada') {
    if (status === 'cancelada' || naoAutorizada) return 'nao_creditar';
    return erros.length ? 'credito_em_risco' : 'pode_creditar';
  }
  if (status === 'cancelada') return 'cancelada';
  if (!erros.length) return 'correta';
  const action = new Map(rules.map((r) => [r.code, r.action ?? actionFor(r.code)]));
  return erros.some((f) => action.get(f.ruleCode) === 'cancelar_reemitir') ? 'cancelar_reemitir' : 'corrigir';
}

export function auditDocument(
  doc: ParsedDocument,
  rules: RuleSeed[],
  client: ClientContext,
  opts: { cancelled?: boolean } = {},
): { findings: EngineFinding[]; status: 'ok' | 'erro' | 'atencao' | 'cancelada' } {
  const findings: EngineFinding[] = [];
  const byCode = new Map(rules.map((r) => [r.code, r]));
  const push = (code: string, severity: FindingSeverity, observed: string, expected: string, itemN: number | null = null) => {
    const r = byCode.get(code);
    if (!r) return;
    findings.push({ ruleCode: code, field: r.field, kind: r.kind, severity, observed, expected, itemN });
  };

  if (doc.model === 'NFSE' && doc.nfse) return { findings, status: auditNfse(doc, push, opts) };

  // ---- tecnicas ----
  if (/^\d{44}$/.test(doc.key)) {
    const dv = accessKeyDv(doc.key.slice(0, 43));
    const real = Number(doc.key[43]);
    push('chave-dv', dv === real ? 'ok' : 'erro', String(real), String(dv));
  } else {
    push('chave-dv', 'erro', doc.key || 'ausente', '44 dígitos');
  }

  const cancelled = !!opts.cancelled || doc.cStat === '101' || doc.cStat === '151';
  if (cancelled) push('situacao-sefaz', 'atencao', 'cancelada', 'autorizada');
  else if (doc.cStat === '100' || doc.cStat === '150') push('situacao-sefaz', 'ok', 'autorizada', 'autorizada');
  else push('situacao-sefaz', 'atencao', doc.cStat ? `cStat ${doc.cStat}` : 'sem protocolo', 'autorizada');

  const reqRule = byCode.get('ibscbs-obrigatorio');
  const isNfe = doc.model === '55' || doc.model === '65';
  if (reqRule && isNfe && doc.issuedAt >= new Date(String((reqRule.definition as any).desde) + 'T00:00:00-03:00')) {
    const missing = doc.items.filter((i) => !i.hasIbsCbs);
    if (missing.length) missing.forEach((i) => push('ibscbs-obrigatorio', 'erro', 'ausente', 'grupo IBSCBS', i.n));
    else push('ibscbs-obrigatorio', 'ok', 'presente', 'grupo IBSCBS');
  }

  // destino: nota recebida pelo cliente com municipio de destino diferente do cadastro
  const recebida = doc.recipient.cnpj.slice(0, 8) === client.cnpjRoot && doc.emitter.cnpj.slice(0, 8) !== client.cnpjRoot;
  if (recebida && client.cityCode && doc.recipient.cityCode) {
    const same = doc.recipient.cityCode === client.cityCode;
    push('destino-cadastro', same ? 'ok' : 'atencao', doc.recipient.city || doc.recipient.cityCode, client.city ?? client.cityCode);
  }

  // ---- tributarias por item (a partir da Reforma) ----
  if (doc.issuedAt >= INICIO_REFORMA) {
    const itemRules = rules.filter((r) => r.kind === 'tributaria' && r.mode !== 'nfse');
    for (const it of doc.items) {
      const ctx = itemContext(doc, it);
      let remessaDivergente = false;
      for (const r of itemRules) {
        // se a regra de remessa ja apontou o cClassTrib, a coerencia CST x cClassTrib seria o mesmo erro contado duas vezes
        if (r.code === 'cst-cclasstrib-coerencia' && remessaDivergente) continue;
        const res = evalItemRule(r, ctx);
        if (!res) continue;
        if (r.code === 'cfop-cclasstrib-remessa' && res.severity === 'erro') remessaDivergente = true;
        push(r.code, res.severity, res.observed, res.expected, it.n);
      }
    }
  }

  let status: 'ok' | 'erro' | 'atencao' | 'cancelada' = 'ok';
  if (cancelled) status = 'cancelada';
  else if (findings.some((f) => f.severity === 'erro')) status = 'erro';
  else if (findings.some((f) => f.severity === 'atencao')) status = 'atencao';
  return { findings, status };
}
