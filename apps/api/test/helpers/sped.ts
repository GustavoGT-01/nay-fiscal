/** Linhas de SPED Fiscal para os testes: cabecalho 0000 e nota C100. */
export const c100 = (o: { oper?: string; mod?: string; sit?: string; num?: string; key: string; dt?: string; total?: string; icms?: string }) =>
  `|C100|${o.oper ?? '0'}|1|F001|${o.mod ?? '55'}|${o.sit ?? '00'}|1|${o.num ?? '10'}|${o.key}|${o.dt ?? '05092026'}|${o.dt ?? '05092026'}|${o.total ?? '100,00'}|0|0,00|0,00|${o.total ?? '100,00'}|9|0,00|0,00|0,00|100,00|${o.icms ?? '12,00'}|0,00|0,00|0,00|0,00|0,00|0,00|0,00|`;
export const h0000 = (cnpj: string, ini = '01092026', fim = '30092026') => `|0000|017|0|${ini}|${fim}|Empresa Exemplo Ltda|${cnpj}||PR|1234567|4115200||||A|1|`;
