/**
 * Faixa de aliquota do ISS.
 *
 * A LC 116/2003 fixa o teto em 5% (art. 8º, II) e a LC 157/2016 o piso em 2% (art. 8º-A), para todos os municipios.
 * Cada municipio define a propria aliquota por item da lista de servicos; essa tabela municipal (por codigo IBGE)
 * nao e inventada aqui: entra pela tabela abaixo, com fonte e vigencia, quando o escritorio a tiver.
 * Sem entrada para o municipio, so o teto de 5% e certo; abaixo de 2% e "a verificar", porque ha excecoes legitimas
 * (itens 7.02, 7.05 e 16.01 e Simples Nacional).
 */

export interface IssMunicipal {
  min: number;
  max: number;
  /** de onde veio a faixa (lei municipal, portal da prefeitura) */
  fonte: string;
  /** inicio de vigencia, AAAA-MM-DD */
  vigencia: string;
}

/** Tabela municipal: codigo IBGE do municipio (7 digitos) para a faixa vigente. Vazia ate ser alimentada com fonte. */
export const ISS_MUNICIPAL: Record<string, IssMunicipal> = {};

export const ISS_PISO_LC116 = 2;
export const ISS_TETO_LC116 = 5;

/** Itens da lista de servicos com aliquota abaixo de 2% permitida: construcao civil (7.02, 7.05) e transporte coletivo (16.01). */
const ITENS_SEM_PISO = ['0702', '0705', '1601'];

export interface FaixaIss {
  min: number;
  max: number;
  origem: 'municipio' | 'lc116';
  /** o piso de 2% nao se aplica a este servico ou prestador */
  semPiso: boolean;
}

export function faixaIss(
  cityCode: string,
  serviceCode: string,
  simplesOption: string,
  tabela: Record<string, IssMunicipal> = ISS_MUNICIPAL,
): FaixaIss {
  const m = tabela[cityCode];
  if (m) return { min: m.min, max: Math.min(m.max, ISS_TETO_LC116), origem: 'municipio', semPiso: false }; // nenhuma lei municipal passa do teto da LC 116
  return {
    min: ISS_PISO_LC116,
    max: ISS_TETO_LC116,
    origem: 'lc116',
    semPiso: ITENS_SEM_PISO.some((i) => serviceCode.startsWith(i)) || simplesOption === '3',
  };
}

/**
 * Julga a aliquota contra a faixa.
 * Acima do maximo e sempre erro; abaixo do minimo e erro so quando a faixa e a do municipio.
 */
export function julgarAliquota(rate: number, f: FaixaIss): 'ok' | 'erro' | 'a_verificar' {
  if (rate > f.max) return 'erro';
  if (rate >= f.min) return 'ok';
  if (f.origem === 'municipio') return 'erro';
  return f.semPiso ? 'ok' : 'a_verificar';
}
