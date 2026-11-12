// Tipos e catalogos compartilhados entre API e Web.
export * from './simples.js';

export type Role = 'ADMIN' | 'OWNER' | 'ANALISTA';

/** Severidade de um achado de auditoria. */
export type Severity = 'erro' | 'atencao' | 'a_verificar' | 'ok';

/** Situacao consolidada de uma nota apos a auditoria. */
export type NoteStatus = 'ok' | 'erro' | 'atencao' | 'cancelada' | 'pendente';

/** Direcao da nota em relacao ao cliente. `all` so existe como filtro. */
export type Direction = 'entrada' | 'saida';
export type DirectionFilter = Direction | 'all';

/** Veredito de entrada: posso tomar credito de IBS/CBS? */
export type EntradaVerdict = 'pode_creditar' | 'credito_em_risco' | 'nao_creditar';
/** Veredito de saida: estou emitindo certo? */
export type SaidaVerdict = 'correta' | 'corrigir' | 'cancelar_reemitir' | 'cancelada';
/** Vazio enquanto a nota nao foi auditada. */
export type Verdict = EntradaVerdict | SaidaVerdict | '';

/** O que fazer quando uma regra aponta erro. */
export type RuleAction = 'cancelar_reemitir' | 'conferir';

/** Telas do sistema. `key` e usado no front e na permissao do perfil. */
export interface ScreenDef {
  key: string;
  path: string;
  label: string;
  icon: string;
  group: 'main' | 'support';
  adminOnly?: boolean;
}

export const SCREENS: ScreenDef[] = [
  { key: 'inicio', path: '/', label: 'Início', icon: 'smart-home', group: 'main' },
  { key: 'importar', path: '/importar', label: 'Importar', icon: 'cloud-upload', group: 'main' },
  { key: 'clientes', path: '/clientes', label: 'Clientes', icon: 'building-store', group: 'main' },
  { key: 'notas', path: '/notas', label: 'Notas', icon: 'file-invoice', group: 'main' },
  { key: 'auditoria', path: '/auditoria', label: 'Auditoria', icon: 'shield-check', group: 'main' },
  { key: 'nfse', path: '/nfse', label: 'NFS-e', icon: 'receipt', group: 'main' },
  { key: 'simulador', path: '/simulador', label: 'Simulador', icon: 'scale', group: 'main' },
  { key: 'creditos', path: '/creditos', label: 'Créditos', icon: 'coins', group: 'main' },
  { key: 'ia', path: '/ia', label: 'Diagnóstico IA', icon: 'sparkles', group: 'main' },
  { key: 'ajuda', path: '/ajuda', label: 'Ajuda', icon: 'lifebuoy', group: 'support' },
  { key: 'gestao', path: '/gestao', label: 'Gestão', icon: 'adjustments-horizontal', group: 'support', adminOnly: true },
];

/** Acoes que tambem podem ser liberadas por perfil (alem das telas). */
export const ACTIONS = [
  { key: 'auditoria.rodar', label: 'Rodar auditoria' },
  { key: 'clientes.enriquecer', label: 'Enriquecer dados de CNPJ' },
  { key: 'notas.reprocessar', label: 'Reprocessar notas' },
  { key: 'dados.apagar', label: 'Apagar notas e dados' },
  { key: 'clientes.gerenciar', label: 'Cadastrar e editar clientes' },
] as const;

/** Regimes tributarios do cadastro de cliente. */
export const REGIMES = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'MEI', label: 'MEI' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'A_DEFINIR', label: 'A definir' },
] as const;
export type Regime = (typeof REGIMES)[number]['value'];
export const regimeLabel = (v: string) => REGIMES.find((r) => r.value === v)?.label ?? v;

/** Remove tudo que nao e digito. */
export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Valida CNPJ pelos digitos verificadores. */
export function cnpjValido(raw: string) {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = base.split('').reduce((a, d, i) => a + Number(d) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

/** Dados de CNPJ vindos da consulta publica (para preencher o cadastro). */
export interface CnpjLookupDTO {
  cnpj: string;
  name: string;
  tradeName: string | null;
  city: string | null;
  cityCode: string | null;
  uf: string | null;
  cnae: string | null;
  simplesOptante: boolean | null;
  regime: Regime;
  situacao: string | null;
}

export interface ClientInputDTO {
  cnpj: string;
  name: string;
  tradeName?: string | null;
  regime: Regime;
  city?: string | null;
  cityCode?: string | null;
  uf?: string | null;
  cnae?: string | null;
}

export interface UploadDTO {
  id: string;
  fileName: string;
  kind: string;
  status: string;
  total: number;
  processed: number;
  okCount: number;
  errorCount: number;
  skipped: number;
  message: string | null;
  createdAt: string;
  clientName: string | null;
  createdClients: string[];
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  officeId: string;
  officeName: string;
  permissions: string[]; // chaves de SCREENS e ACTIONS
}

export interface ClientDTO {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string;
  regime: string;
  city: string | null;
  uf: string | null;
  cityCode: string | null;
  cnae: string | null;
  totalNotes: number;
  /** 0-100; null quando o cliente ainda nao tem notas */
  conformity: number | null;
  establishments: { id: string; label: string; cnpj: string }[];
}

export interface NoteRowDTO {
  id: string;
  number: string;
  series: string;
  model: string;
  key: string;
  direction: 'entrada' | 'saida';
  issuedAt: string;
  counterpart: string;
  counterpartCnpj: string;
  cfop: string;
  total: number;
  status: NoteStatus;
  verdict: Verdict;
  findings: { rule: string; title: string; severity: Severity }[];
  /** so NFS-e */
  service?: { code: string; description: string; issRate: number; issValue: number; retained: boolean; competence: string | null } | null;
}

export interface FindingDTO {
  id: string;
  ruleCode: string | null;
  field: string;
  title: string;
  severity: Severity;
  kind: 'tecnica' | 'tributaria';
  itemNumber: number | null;
  observed: string;
  expected: string;
  what: string | null;
  why: string | null;
  how: string | null;
  fixTag: string | null;
  legalBasis: string | null;
  xmlSnippet: string | null;
  highlight: string | null;
  action: RuleAction;
}

export interface NoteDetailDTO extends NoteRowDTO {
  emitter: { name: string; cnpj: string; city: string; uf: string; crt: string | null };
  recipient: { name: string; cnpj: string; city: string; uf: string };
  natureOfOperation: string;
  protocol: string | null;
  items: {
    n: number; code: string; description: string; ncm: string; cfop: string; qty: number; unitValue: number; total: number;
    cstIcms: string | null; vIcms: number; cstIbsCbs: string | null; cClassTrib: string | null; vIbs: number; vCbs: number;
  }[];
  taxes: { vBc: number; vIcms: number; vPis: number; vCofins: number; vIbs: number; vCbs: number };
  checks: FindingDTO[];
  /** Entradas com erro: texto pronto para mandar ao fornecedor. */
  supplierMessage: string | null;
  /** dados de servico e ISS (so NFS-e) */
  nfse?: NfseDetailDTO | null;
  /** Explicacao da CC-e, quando alguma acao e cancelar e reemitir. */
  cceNote: string | null;
}

export interface RuleGroupDTO {
  code: string;
  title: string;
  severity: Severity;
  description: string;
  fixTag: string | null;
  items: number;
  notes: number;
  sampleNotes: { id: string; number: string }[];
}

export interface SupplierGroupDTO {
  cnpj: string;
  name: string;
  notes: number;
  withError: number;
  withAttention: number;
}

export interface DashboardDTO {
  client: { id: string; name: string } | null;
  totals: { audited: number; ok: number; erro: number; atencao: number; cancelada: number };
  barcode: { id: string; number: string; status: NoteStatus; total: number; counterpart: string; topFinding: string | null; weight: number }[];
  topErrors: { code: string; title: string; items: number }[];
  lastAuditAt: string | null;
  verdicts: {
    entradas: Record<EntradaVerdict, number>;
    saidas: Record<SaidaVerdict, number>;
  };
}

export const REFORMA = {
  cbsTeste: 0.009,
  ibsTeste: 0.001,
  grupoObrigatorioDesde: '2026-08-03',
};

/** Resultado de uma limpeza de dados (quantidades apagadas). */
export interface WipeResultDTO {
  documents: number;
  items: number;
  findings: number;
  uploads: number;
  auditRuns: number;
}

/** Linha da tela de Gestao: dados guardados por cliente. */
export interface AdminClientSummaryDTO {
  id: string;
  name: string;
  cnpj: string;
  notes: number;
  uploads: number;
}

export interface AdminUserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  profile: string | null;
  createdAt: string;
}

/** Dados da NFS-e (servico, ISS e retencoes). */
export interface NfseDetailDTO {
  serviceCode: string;
  serviceMunicipalCode: string;
  nbs: string;
  description: string;
  competence: string | null;
  /** 1 tributavel, 2 imunidade, 3 exportacao, 4 nao incidencia */
  issTributacao: string;
  /** 1 nao retido, 2 retido pelo tomador, 3 retido pelo intermediario */
  issRetention: string;
  issBase: number;
  issRate: number;
  issValue: number;
  serviceValue: number;
  discounts: number;
  retentionsTotal: number;
  netValue: number;
  incidenceCityCode: string;
  incidenceCity: string;
  serviceCityCode: string;
  /** 1 nao optante, 2 MEI, 3 ME/EPP */
  simplesOption: string;
  providerIm: string;
  retPis: number;
  retCofins: number;
  retIrrf: number;
  retCsll: number;
  retCp: number;
  hasIbsCbs: boolean;
}

export interface NfseSummaryDTO {
  notes: number;
  withError: number;
  prestadas: number;
  tomadas: number;
  serviceValue: number;
  issValue: number;
  issRetained: number;
  federalRetained: number;
}

export const ISS_TRIBUTACAO: Record<string, string> = { '1': 'Tributável', '2': 'Imunidade', '3': 'Exportação', '4': 'Não incidência' };
export const ISS_RETENCAO: Record<string, string> = { '1': 'Não retido', '2': 'Retido pelo tomador', '3': 'Retido pelo intermediário' };
export const SIMPLES_OPCAO: Record<string, string> = { '1': 'Não optante', '2': 'MEI', '3': 'Simples (ME/EPP)' };