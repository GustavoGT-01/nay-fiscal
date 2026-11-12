import * as documents from '../models/document.js';
import * as findings from '../models/finding.js';
import { ruleMap } from '../models/rule.js';

/** Diagnostico (sem IA): respostas montadas a partir da auditoria do cliente. */
export async function answerQuestion(client: { id: string; name: string }, question: string) {
  const rules = await ruleMap();
  const [byRule, byStatus, worst] = await Promise.all([
    findings.countByRuleAndSeverity(client.id),
    documents.countByStatus(client.id),
    documents.worstSuppliers(client.id),
  ]);
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const total = byStatus.reduce((a, x) => a + x._count, 0);
  const errs = byRule.filter((r) => r.severity === 'erro');
  const q = question.toLowerCase();
  let answer: string;
  if (/cclass|remessa|corrig/.test(q)) {
    const r = rules.get('cfop-cclasstrib-remessa')!;
    const c = byRule.find((x) => x.ruleCode === r.code)?._count ?? 0;
    answer = `${c} itens têm cClassTrib errado em remessa. ${r.description} Como corrigir: ${r.how.replace('{cfop}', 'de remessa').replace('{cst}', '410').replace('{esperado}', '410999')} Base: ${r.legalBasis}.`;
  } else if (/h[ií]brido|simples|vale/.test(q)) {
    answer = 'Depende de quanto do seu faturamento vai para empresas do regime regular e de quanto você compra com crédito. Abra o Simulador do Simples: em 7 etapas ele compara o imposto mensal e o crédito que seus clientes ganham no Híbrido (LC 214/2025, art. 41).';
  } else if (/fornecedor/.test(q)) {
    answer = worst.length
      ? `Os fornecedores com mais notas com erro são ${worst.map((w) => `${w.emitterName} (${w._count})`).join(', ')}. Na Auditoria, a visão por fornecedor mostra a distribuição completa.`
      : 'Nenhum fornecedor com notas com erro nesta carteira.';
  } else {
    answer = `Analisei as ${total} notas da ${client.name}: ${n('erro')} com erro, ${n('atencao')} com atenção e ${n('cancelada')} canceladas.` +
      (errs.length ? ` Os erros mais frequentes são ${errs.slice(0, 2).map((e) => `“${rules.get(e.ruleCode)?.title}” (${e._count} itens)`).join(' e ')}. Quer que eu detalhe alguma delas?` : ' Nenhum erro encontrado.');
  }
  return { answer, mode: 'regras' as const };
}