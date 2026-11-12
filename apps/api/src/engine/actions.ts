/** O que fazer quando a regra aponta erro: cancelar e reemitir (campo que define o imposto) ou conferir. */
export type RuleAction = 'cancelar_reemitir' | 'conferir';

/** Regras cujo erro esta num campo que define o imposto: a CC-e nao corrige. */
export const CANCELAR_REEMITIR = [
  'cfop-cclasstrib-remessa',
  'cfop-sem-valores-ibs-cbs',
  'ibscbs-obrigatorio',
  'cst-cclasstrib-coerencia',
  'cst-ibscbs-formato',
  'crt1-icms-por-cst',
  'crt3-icms-por-csosn',
  // NFS-e: codigo, aliquota e valor do ISS definem o imposto
  'nfse-codigo-servico',
  'nfse-aliquota-iss',
  'nfse-calculo-iss',
  'nfse-iss-sem-tributacao',
];

export const actionFor = (code: string): RuleAction => (CANCELAR_REEMITIR.includes(code) ? 'cancelar_reemitir' : 'conferir');

/** Por que nao basta a Carta de Correcao. */
export const CCE_EXPLICACAO =
  'A Carta de Correção (CC-e) não corrige base de cálculo, alíquota, valor do imposto nem campos que definem o imposto (Convênio SINIEF s/nº de 1970, art. 7º, §1º-A). Nesse caso, cancele a nota dentro do prazo da SEFAZ e emita outra, ou fale com o contador.';
