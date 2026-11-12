import type { FindingDTO, Verdict } from '@nay/shared';
import '../styles/verdict.css';

/** Rotulo, cor (classe do mockup) e explicacao curta de cada veredito. */
export const VERDICT: Record<Exclude<Verdict, ''>, { label: string; cls: 'ok' | 'atencao' | 'erro' | 'neutro'; icon: string; text: string }> = {
  pode_creditar: { label: 'Pode creditar', cls: 'ok', icon: 'ti-circle-check', text: 'Nota sem erros. O crédito de IBS/CBS pode ser tomado.' },
  credito_em_risco: { label: 'Crédito em risco', cls: 'erro', icon: 'ti-alert-triangle', text: 'A nota tem erro. Peça a correção ao fornecedor antes de tomar o crédito.' },
  nao_creditar: { label: 'Não creditar', cls: 'erro', icon: 'ti-ban', text: 'Nota cancelada ou sem autorização na SEFAZ. Não gera crédito.' },
  correta: { label: 'Correta', cls: 'ok', icon: 'ti-circle-check', text: 'Sua nota está correta. Siga emitindo assim.' },
  corrigir: { label: 'Corrigir', cls: 'atencao', icon: 'ti-tool', text: 'Há erro, mas não em campo que define o imposto. Ajuste o cadastro e confira a nota.' },
  cancelar_reemitir: { label: 'Cancelar e reemitir', cls: 'erro', icon: 'ti-refresh-alert', text: 'O erro está num campo que define o imposto. Cancele dentro do prazo da SEFAZ e emita outra nota.' },
  cancelada: { label: 'Cancelada', cls: 'neutro', icon: 'ti-ban', text: 'Nota cancelada na SEFAZ, fora da apuração.' },
};

/** O que fazer com um achado. Na entrada, quem corrige é o fornecedor. */
export function actionLabel(f: FindingDTO, direction: 'entrada' | 'saida') {
  if (f.severity !== 'erro') return 'Conferir';
  if (direction === 'entrada') return 'Pedir correção ao fornecedor';
  return f.action === 'cancelar_reemitir' ? 'Cancelar e reemitir' : 'Conferir';
}
