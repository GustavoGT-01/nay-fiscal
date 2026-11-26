/**
 * Leitura do SPED Fiscal (EFD ICMS/IPI) em texto: uma linha por registro, campos entre barras.
 * Le o cabecalho (0000) e as notas (C100) de NF-e e NFC-e. Itens (C170) e analiticos (C190) ainda nao sao lidos.
 */

export interface SpedHeader {
  cnpj: string;
  name: string;
  uf: string;
  /** primeiro e ultimo dia da escrituracao */
  start: Date;
  end: Date;
}

export interface SpedEntry {
  /** linha do arquivo (1 = primeira), para o usuario achar o registro */
  line: number;
  operation: 'entrada' | 'saida';
  codSit: string;
  series: string;
  number: string;
  key: string;
  issuedAt: Date | null;
  totalCents: number;
  icmsCents: number;
}

export interface SpedParsed {
  header: SpedHeader;
  entries: SpedEntry[];
  /** C100 de outros modelos (NF papel, modelo 1/1A etc.) e de chave invalida: nao entram no cruzamento */
  ignored: number;
}

/** Situacoes em que o documento nao vale: cancelado, denegado ou inutilizado. */
export const SIT_SEM_EFEITO = new Set(['02', '03', '04', '05']);

const dia = (ddmmaaaa: string) => {
  if (!/^\d{8}$/.test(ddmmaaaa)) return null;
  const d = new Date(`${ddmmaaaa.slice(4)}-${ddmmaaaa.slice(2, 4)}-${ddmmaaaa.slice(0, 2)}T00:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "1234,56" para 123456 centavos; vazio vira 0. */
export const centavos = (v: string | undefined) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** O SPED costuma vir em ISO-8859-1; UTF-8 valido vale como esta. */
export function decodeSped(buf: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return buf.toString('latin1'); }
}

export function parseSped(text: string): SpedParsed {
  let header: SpedHeader | null = null;
  const entries: SpedEntry[] = [];
  let ignored = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.length < 6 || raw[0] !== '|') continue;
    const f = raw.split('|').slice(1, -1); // f[0] = registro
    if (f[0] === '0000' && !header) {
      const start = dia(f[3] ?? '');
      const end = dia(f[4] ?? '');
      const cnpj = (f[6] ?? '').replace(/\D/g, '');
      if (!start || !end || cnpj.length !== 14) throw new Error('SPED com cabecalho (registro 0000) invalido: confira as datas e o CNPJ.');
      header = { cnpj, name: f[5] ?? '', uf: f[8] ?? '', start, end };
    } else if (f[0] === 'C100') {
      const key = (f[8] ?? '').replace(/\D/g, '');
      if (!['55', '65'].includes(f[4] ?? '') || key.length !== 44) { ignored++; continue; }
      entries.push({
        line: i + 1,
        operation: f[1] === '0' ? 'entrada' : 'saida',
        codSit: f[5] ?? '',
        series: f[6] ?? '',
        number: f[7] ?? '',
        key,
        issuedAt: dia(f[9] ?? ''),
        totalCents: centavos(f[11]),
        icmsCents: centavos(f[21]),
      });
    }
  }
  if (!header) throw new Error('O arquivo não parece um SPED Fiscal: falta o registro 0000.');
  return { header, entries, ignored };
}
