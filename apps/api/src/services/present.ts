import type { Document as DbDocument, DocumentItem as DbDocumentItem, Finding, Rule } from '@prisma/client';
import type { Reais } from '../lib/money.js';
import type { FindingDTO, RuleAction, Severity } from '@nay/shared';
import { actionFor } from '../engine/actions.js';

/** Notas e itens chegam dos models em reais (number); no banco ficam em centavos. */
type Document = Reais<DbDocument>;
type DocumentItem = Reais<DbDocumentItem>;

const FIELD_TAG: Record<string, string> = {
  cclass_trib: 'cClassTrib',
  valores_ibs_cbs: 'gIBSCBS',
  cst_ibs_cbs: 'IBSCBS',
  tabela_icms: 'ICMS',
  cst_pis: 'PIS',
  cst_cofins: 'COFINS',
  cfop: 'CFOP',
  grupo_ibscbs: 'imposto',
  codigo_servico: 'cTribNac',
  aliquota_iss: 'pAliqAplic',
  valor_iss: 'vISSQN',
  tributacao_iss: 'tribISSQN',
  retencao_iss: 'tpRetISSQN',
  mei_iss: 'vISSQN',
  valor_liquido: 'vLiq',
};

/** Rotulos legiveis para valores internos. */
const pretty = (v: string) => (v === 'ausente' ? 'ausente' : v === 'informado' ? 'informado' : v);

function fill(tpl: string | null, f: Finding, item: DocumentItem | null, doc: DocLike) {
  if (!tpl) return null;
  const cst = f.expected.slice(0, 3);
  return tpl
    .replaceAll('{cfop}', item?.cfop ?? '')
    .replaceAll('{item}', item ? String(item.n) : '')
    .replaceAll('{ncm}', item?.ncm ?? '')
    .replaceAll('{crt}', doc.emitterCrt ?? '')
    .replaceAll('{cst}', /^\d{3}$/.test(cst) ? cst : '410')
    .replaceAll('{observado}', pretty(f.observed))
    .replaceAll('{esperado}', pretty(f.expected));
}

/** Indenta o XML (uma tag por linha) para exibir trechos. */
function prettyXml(xml: string) {
  const lines: string[] = [];
  let depth = 0;
  for (const tok of xml.replace(/>\s*</g, '><').split(/(?=<)/)) {
    if (!tok.trim()) continue;
    if (tok.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      // junta "<x>valor" + "</x>" na mesma linha
      const last = lines[lines.length - 1];
      if (last && !last.trim().startsWith('</') && /^<[^/][^>]*>[^<]+$/.test(last.trim())) {
        lines[lines.length - 1] = last + tok;
        continue;
      }
      lines.push('  '.repeat(depth) + tok);
    } else {
      lines.push('  '.repeat(depth) + tok);
      if (!tok.endsWith('/>') && !/^<\?/.test(tok)) depth++;
    }
  }
  return lines.join('\n');
}

/** Recorta o <det> do item no XML para o botao "Ver no XML". */
function xmlSnippet(doc: DocLike, item: DocumentItem | null) {
  if (!doc.xml) return null; // exportacao carrega a nota sem o XML
  if (doc.model === 'NFSE') {
    // NFS-e: valores calculados pela Sefin + servico e tributos declarados na DPS
    const nfseVal = doc.xml.match(/<infNFSe[\s\S]*?(<valores>[\s\S]*?<\/valores>)/)?.[1] ?? '';
    const dps = doc.xml.slice(doc.xml.indexOf('<infDPS'));
    const serv = dps.match(/<serv>[\s\S]*?<\/serv>/)?.[0] ?? '';
    const val = dps.match(/<valores>[\s\S]*?<\/valores>/)?.[0] ?? '';
    const parts = [nfseVal && '<!-- valores da NFS-e -->\n' + prettyXml(nfseVal), serv && '<!-- servico (DPS) -->\n' + prettyXml(serv), val && '<!-- valores (DPS) -->\n' + prettyXml(val)];
    return parts.filter(Boolean).join('\n') || null;
  }
  if (!item) return null;
  const m = doc.xml.match(new RegExp(`<det nItem="${item.n}">([\\s\\S]*?)</det>`));
  if (!m) return null;
  const inner = m[1].replace(/<infAdProd>[\s\S]*?<\/infAdProd>/, '');
  return `<!-- det nItem="${item.n}" -->\n` + prettyXml(inner);
}

const cap = (s: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : '');

/** Texto pronto para mandar ao fornecedor quando a nota de entrada tem erro. */
export function supplierMessage(doc: Document, checks: FindingDTO[], cceNote: string): string | null {
  const erros = checks.filter((c) => c.severity === 'erro');
  if (doc.direction !== 'entrada' || !erros.length) return null;
  const data = doc.issuedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const lines = [
    `Olá, ${doc.emitterName}.`,
    '',
    `Recebemos a NF-e nº ${doc.number}, série ${doc.series}, emitida em ${data}.`,
    `Chave de acesso: ${doc.key}`,
    '',
    erros.length === 1 ? 'Na conferência encontramos um erro que precisa de correção:' : `Na conferência encontramos ${erros.length} erros que precisam de correção:`,
  ];
  erros.forEach((e, i) => {
    lines.push('', `${i + 1}. ${e.title}${e.itemNumber ? ` (item ${e.itemNumber})` : ''}`);
    lines.push(`   Está no XML: ${e.observed}`);
    lines.push(`   Deveria ser: ${e.expected}`);
    if (e.how) lines.push(`   Como corrigir: ${cap(e.how)}`);
    if (e.legalBasis) lines.push(`   Base: ${e.legalBasis}`);
  });
  if (erros.some((e) => e.action === 'cancelar_reemitir')) lines.push('', cceNote);
  lines.push('', 'Com a nota corrigida, conseguimos tomar o crédito de IBS/CBS. Aguardamos o retorno.', '', 'Obrigado.');
  return lines.join('\n');
}

/** Nota com ou sem o XML bruto (a exportacao nao carrega o XML). */
type DocLike = Omit<Document, 'xml'> & { xml?: string };

export function presentFinding(f: Finding, rule: Rule | undefined, item: DocumentItem | null, doc: DocLike): FindingDTO {
  const okTitle: Record<string, string> = {
    'chave-dv': `Chave de acesso válida (DV ${f.observed})`,
    'situacao-sefaz': 'Autorizada na SEFAZ (cStat 100)',
    'ibscbs-obrigatorio': 'Grupo IBS/CBS presente',
    'destino-cadastro': 'Destino igual ao cadastro',
    'nfse-codigo-servico': 'Código do serviço válido',
    'nfse-aliquota-iss': 'Alíquota de ISS dentro de 2% a 5%',
    'nfse-calculo-iss': 'ISS = base × alíquota',
    'nfse-iss-sem-tributacao': 'Sem ISS em serviço não tributado',
    'nfse-mei-iss': 'MEI sem ISS destacado',
    'nfse-retencao-tomador': 'Retenção de ISS por tomador empresa',
    'nfse-valor-liquido': 'Valor líquido confere',
    'nfse-ibscbs': 'Grupo IBS/CBS presente',
    'cfop-cclasstrib-remessa': 'cClassTrib da remessa correto',
    'cfop-sem-valores-ibs-cbs': 'Remessa sem IBS/CBS destacado',
    'cst-ibscbs-formato': 'CST de IBS/CBS no formato certo',
    'cst-cclasstrib-coerencia': 'cClassTrib combina com o CST',
    'crt1-icms-por-cst': 'ICMS coerente com o regime do emitente',
    'crt3-icms-por-csosn': 'ICMS coerente com o regime do emitente',
    'cst-pis-atipico-simples': 'CST de PIS coerente',
    'cst-cofins-atipico-simples': 'CST de COFINS coerente',
  };
  if (doc.model === 'NFSE') okTitle['situacao-sefaz'] = 'NFS-e autorizada na Sefin Nacional';
  const title =
    f.severity === 'ok'
      ? okTitle[f.ruleCode] ?? `${rule?.title ?? f.ruleCode}: conforme`
      : f.ruleCode === 'situacao-sefaz' && f.observed === 'cancelada'
        ? 'Nota cancelada na SEFAZ'
        : f.ruleCode === 'cfop-cclasstrib-remessa' && f.observed === 'ausente'
          ? 'Remessa sem cClassTrib'
          : rule?.title ?? f.ruleCode;
  return {
    id: f.id,
    ruleCode: f.ruleCode,
    field: f.field,
    title,
    severity: f.severity as Severity,
    kind: f.kind as FindingDTO['kind'],
    itemNumber: item?.n ?? null,
    observed: pretty(f.observed),
    expected: pretty(f.expected),
    what: fill(rule?.what ?? null, f, item, doc),
    why: fill(rule?.why ?? null, f, item, doc),
    how: fill(rule?.how ?? null, f, item, doc),
    fixTag: fill(rule?.fixTag ?? null, f, item, doc),
    legalBasis: rule?.legalBasis ?? null,
    xmlSnippet: f.severity === 'ok' ? null : xmlSnippet(doc, item),
    highlight: FIELD_TAG[f.field] ?? null,
    action: (rule?.action ?? actionFor(f.ruleCode)) as RuleAction,
  };
}
