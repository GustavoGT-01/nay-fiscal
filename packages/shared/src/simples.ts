/**
 * Calculo do Simulador Simples Puro x Simples Hibrido.
 * Tabelas: LC 123/2006, Anexos I a III (vigentes desde 2018).
 * Hibrido: LC 214/2025, art. 41 §3º (IBS/CBS recolhidos pelo regime regular).
 * A parcela do DAS substituida por IBS/CBS (PIS, COFINS, ICMS/ISS) usa a reparticao
 * media da 1ª a 5ª faixa de cada anexo: e uma estimativa, sinalizada no laudo.
 */

export type Anexo = 'I' | 'II' | 'III';

const FAIXAS: Record<Anexo, [number, number, number][]> = {
  // [limite RBT12, aliquota nominal, parcela a deduzir]
  I: [[180000, 0.04, 0], [360000, 0.073, 5940], [720000, 0.095, 13860], [1800000, 0.107, 22500], [3600000, 0.143, 87300], [4800000, 0.19, 378000]],
  II: [[180000, 0.045, 0], [360000, 0.078, 5940], [720000, 0.1, 13860], [1800000, 0.112, 22500], [3600000, 0.147, 85500], [4800000, 0.3, 720000]],
  III: [[180000, 0.06, 0], [360000, 0.112, 9360], [720000, 0.135, 17640], [1800000, 0.16, 35640], [3600000, 0.21, 125640], [4800000, 0.33, 648000]],
};

/** Parcela media do DAS correspondente a PIS + COFINS + ICMS/ISS. */
export const PARCELA_SUBSTITUIDA: Record<Anexo, number> = { I: 0.495, II: 0.46, III: 0.49 };

export const ANEXOS: { value: Anexo; label: string }[] = [
  { value: 'I', label: 'Anexo I, comércio' },
  { value: 'II', label: 'Anexo II, indústria' },
  { value: 'III', label: 'Anexo III, serviços' },
];

export function aliquotaEfetiva(anexo: Anexo, rbt12: number) {
  const tab = FAIXAS[anexo];
  const idx = tab.findIndex(([lim]) => rbt12 <= lim);
  const [, nominal, deduzir] = tab[idx === -1 ? tab.length - 1 : idx];
  const efetiva = rbt12 > 0 ? (rbt12 * nominal - deduzir) / rbt12 : nominal;
  return { faixa: (idx === -1 ? tab.length : idx + 1), nominal, deduzir, efetiva: Math.max(0, efetiva), acimaDoLimite: rbt12 > 4800000 };
}

export interface SimInput {
  anexo: Anexo;
  faturamentoMensal: number;
  /** fracao das vendas para empresas do regime regular (0-1) */
  vendasB2B: number;
  /** compras mensais de fornecedores que geram credito de IBS/CBS */
  comprasComCredito: number;
  /** aliquota de referencia IBS + CBS (ex.: 0.265) */
  aliquotaReferencia: number;
}

export function simular(i: SimInput) {
  const rbt12 = i.faturamentoMensal * 12;
  const al = aliquotaEfetiva(i.anexo, rbt12);
  const share = PARCELA_SUBSTITUIDA[i.anexo];
  const dasPuro = i.faturamentoMensal * al.efetiva;
  const dasHibrido = dasPuro * (1 - share);
  const debito = i.faturamentoMensal * i.aliquotaReferencia;
  const credito = i.comprasComCredito * i.aliquotaReferencia;
  const ivaHibrido = Math.max(0, debito - credito);
  const custoHibrido = dasHibrido + ivaHibrido;
  const custoExtra = custoHibrido - dasPuro;
  const creditoClientesPuro = i.faturamentoMensal * i.vendasB2B * al.efetiva * share;
  const creditoClientesHibrido = i.faturamentoMensal * i.vendasB2B * i.aliquotaReferencia;
  const ganhoClientes = creditoClientesHibrido - creditoClientesPuro;
  return {
    rbt12, ...al, share, dasPuro, dasHibrido, debito, credito, ivaHibrido, custoHibrido, custoExtra,
    creditoClientesPuro, creditoClientesHibrido, ganhoClientes,
    recomendado: (ganhoClientes > custoExtra ? 'hibrido' : 'puro') as 'hibrido' | 'puro',
  };
}
