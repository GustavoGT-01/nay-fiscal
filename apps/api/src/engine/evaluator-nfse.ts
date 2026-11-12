import type { ParsedDocument } from '../xml/nfe-parser.js';
import { INICIO_REFORMA, type FindingSeverity, type Push } from './types.js';

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

/** Regras da NFS-e nacional: ISS (LC 116/2003), retencoes e grupo IBS/CBS. */
export function auditNfse(doc: ParsedDocument, push: Push, opts: { cancelled?: boolean }): 'ok' | 'erro' | 'atencao' | 'cancelada' {
  const out: { ruleCode: string; severity: FindingSeverity }[] = [];
  const p: Push = (code, sev, obs, exp, item = null) => { out.push({ ruleCode: code, severity: sev }); push(code, sev, obs, exp, item); };
  const s = doc.nfse!;

  const cancelled = !!opts.cancelled || doc.cStat === '101' || doc.cStat === '102';
  if (cancelled) p('situacao-sefaz', 'atencao', 'cancelada', 'autorizada');
  else if (!doc.cStat || doc.cStat === '100') p('situacao-sefaz', 'ok', 'autorizada', 'autorizada');
  else p('situacao-sefaz', 'atencao', `cStat ${doc.cStat}`, 'autorizada');

  p('nfse-codigo-servico', /^\d{6}$/.test(s.serviceCode) ? 'ok' : 'erro', s.serviceCode || 'ausente', '6 dígitos (item da LC 116)', 1);

  const tributavel = s.issTributacao === '1' || s.issTributacao === '';
  const mei = s.simplesOption === '2';
  if (tributavel && !mei && s.issValue > 0) {
    const okRate = s.issRate >= 2 && s.issRate <= 5;
    p('nfse-aliquota-iss', okRate ? 'ok' : 'erro', pct(s.issRate), 'entre 2% e 5%', 1);
    const esperado = Math.round(s.issBase * s.issRate) / 100;
    const okCalc = Math.abs(esperado - s.issValue) <= 0.02;
    p('nfse-calculo-iss', okCalc ? 'ok' : 'erro', 'R$ ' + brl(s.issValue), 'R$ ' + brl(esperado), 1);
  }
  if (!tributavel) {
    p('nfse-iss-sem-tributacao', s.issValue > 0 ? 'erro' : 'ok', s.issValue > 0 ? 'R$ ' + brl(s.issValue) : 'sem ISS', 'sem ISS', 1);
  }
  if (mei) p('nfse-mei-iss', s.issValue > 0 ? 'atencao' : 'ok', s.issValue > 0 ? 'R$ ' + brl(s.issValue) : 'sem ISS', 'sem ISS destacado', 1);
  if (s.issRetention === '2') {
    const pf = doc.recipient.cnpj.length === 11;
    p('nfse-retencao-tomador', pf ? 'atencao' : 'ok', pf ? 'tomador pessoa física' : 'tomador empresa', 'tomador com CNPJ', 1);
  }
  const liq = Math.round((s.serviceValue - s.discounts - s.retentionsTotal) * 100) / 100;
  if (s.netValue > 0) p('nfse-valor-liquido', Math.abs(liq - s.netValue) <= 0.05 ? 'ok' : 'atencao', 'R$ ' + brl(s.netValue), 'R$ ' + brl(liq));
  if (doc.issuedAt >= INICIO_REFORMA) p('nfse-ibscbs', s.hasIbsCbs ? 'ok' : 'atencao', s.hasIbsCbs ? 'presente' : 'ausente', 'grupo IBSCBS');

  if (cancelled) return 'cancelada';
  if (out.some((f) => f.severity === 'erro')) return 'erro';
  if (out.some((f) => f.severity === 'atencao')) return 'atencao';
  return 'ok';
}