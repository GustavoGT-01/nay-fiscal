export type FindingSeverity = 'erro' | 'atencao' | 'a_verificar' | 'ok';

export interface EngineFinding {
  ruleCode: string;
  field: string;
  kind: 'tecnica' | 'tributaria';
  severity: FindingSeverity;
  observed: string;
  expected: string;
  itemN: number | null;
}

export interface ClientContext {
  /** 8 primeiros digitos do CNPJ do cliente (raiz: matriz e filiais). */
  cnpjRoot: string;
  cityCode: string | null;
  city: string | null;
}

export type Push = (code: string, severity: FindingSeverity, observed: string, expected: string, itemN?: number | null) => void;

/** Inicio da Reforma: a partir daqui as regras de IBS/CBS valem. */
export const INICIO_REFORMA = new Date('2026-01-01T00:00:00-03:00');
