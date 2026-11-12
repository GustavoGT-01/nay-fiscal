import { readFileSync } from 'node:fs';
import type { Loaded } from './types.js';
import { box, brl, dec, esc, fmtCep, fmtDate, fmtDoc, fmtKey, fmtTime, MOD_FRETE } from './format.js';
import { findingCard, party } from './blocks.js';
import { nfseSection } from './nfse-section.js';

/** Estilo do documento (A4), em arquivo proprio para ler e editar como CSS. */
const NOTE_CSS = readFileSync(new URL('./note.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** HTML completo (A4) da nota com o diagnostico, pronto para imprimir ou salvar em PDF. */
export function renderNoteHtml({ doc: d, checks }: Loaded, now = new Date()) {
  const docLabel = d.model === '57' ? 'CT-e' : d.model === '65' ? 'NFC-e' : d.model === 'NFSE' ? 'NFS-e' : 'NF-e';
  const tpNF = d.xml.match(/<tpNF>(\d)<\/tpNF>/)?.[1] ?? (d.model === '57' ? '1' : '');
  const cfops = [...new Set(d.items.map((i) => i.cfop).filter(Boolean))].join(', ');
  const problems = checks.filter((c) => c.severity !== 'ok');
  const oks = checks.filter((c) => c.severity === 'ok');
  const nErr = checks.filter((c) => c.severity === 'erro').length;
  const nAtt = checks.filter((c) => c.severity === 'atencao' || c.severity === 'a_verificar').length;
  const summaryHint = d.cancelled
    ? 'Nota cancelada na SEFAZ, fora da apuração.'
    : nErr ? 'Corrija os erros antes de escriturar.' : nAtt ? 'Sem erros. Vale revisar os pontos de atenção.' : 'Nota pronta para escriturar.';
  const sumCls = d.cancelled ? 'muted' : nErr ? 'erro' : nAtt ? 'atencao' : 'ok';

  const emitter = { name: d.emitterName, cnpj: d.emitterCnpj, street: d.emitterStreet, number: d.emitterNumber, complement: d.emitterComplement, district: d.emitterDistrict, cep: d.emitterCep, city: d.emitterCity, uf: d.emitterUf, ie: d.emitterIe };
  const recipient = { name: d.recipientName, cnpj: d.recipientCnpj, street: d.recipientStreet, number: d.recipientNumber, complement: d.recipientComplement, district: d.recipientDistrict, cep: d.recipientCep, city: d.recipientCity, uf: d.recipientUf, ie: d.recipientIe };
  const emitAddr = [[d.emitterStreet, d.emitterNumber].filter(Boolean).join(', '), d.emitterComplement, d.emitterDistrict].filter(Boolean).join(' - ');
  const emitCity = [d.emitterCity && `${d.emitterCity}/${d.emitterUf}`, d.emitterCep && `CEP ${fmtCep(d.emitterCep)}`].filter(Boolean).join(' · ');

  const items = d.items.map((i) => `
    <tr>
      <td class="c">${i.n}</td>
      <td><span class="mono muted">${esc(i.code)}</span> ${esc(i.description)}</td>
      <td class="mono">${esc(i.ncm)}</td>
      <td class="mono">${esc(i.cfop)}</td>
      <td class="c">${esc(i.unit)}</td>
      <td class="r mono">${dec(i.qty)}</td>
      <td class="r mono">${dec(i.unitValue)}</td>
      <td class="r mono">${dec(i.total, 2)}</td>
      <td class="c mono">${esc(i.cstIcms ?? '—')}</td>
      <td class="c mono">${esc(i.cstIbsCbs ?? '—')}</td>
      <td class="c mono">${esc(i.cClassTrib ?? '—')}</td>
      <td class="r mono">${dec(i.vIbs, 2)}</td>
      <td class="r mono">${dec(i.vCbs, 2)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${docLabel} ${d.number} - Nay Fiscal`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
${NOTE_CSS}
</style>
</head>
<body>
<header class="head">
  <div class="mark"><span>N</span></div>
  <div class="brand">Nay Fiscal</div>
  <div class="doc"><b>${esc(docLabel)} ${esc(d.number)}</b><div class="muted">Série ${esc(d.series)} · ${esc(fmtDate(d.issuedAt))}${d.cancelled ? ' · <span class="cancel">Cancelada</span>' : ''}</div></div>
</header>
<div class="disclaimer">Documento auxiliar gerado pela Nay Fiscal, não substitui o ${d.model === 'NFSE' ? 'DANFSe' : 'DANFE'} oficial.</div>

${d.model === 'NFSE' ? nfseSection(d, recipient) : `<section>
  <div class="grid g-top">
    <div class="f emit">
      <small>Emitente</small>
      <b>${esc(d.emitterName)}</b>
      <div>${esc(emitAddr)}</div>
      <div>${esc(emitCity)}</div>
      <div class="mono">CNPJ ${esc(fmtDoc(d.emitterCnpj))}</div>
      ${d.emitterIe ? `<div class="mono">IE ${esc(d.emitterIe)}</div>` : ''}
    </div>
    <div class="f">
      <small>${esc(docLabel)}</small>
      <div class="tp"><em>${esc(tpNF || '—')}</em><span>0 - Entrada<br>1 - Saída</span></div>
    </div>
    <div class="f"><small>Número / série</small><span class="mono" style="font-size:10pt;font-weight:600">Nº ${esc(d.number)} · Série ${esc(d.series)}</span></div>
    <div class="f span2"><small>Chave de acesso</small><span class="mono" style="font-size:8pt;white-space:nowrap">${esc(fmtKey(d.key))}</span></div>
  </div>
  <div class="grid g-op" style="margin-top:5px">
    ${box('Natureza da operação', esc(d.natOp))}
    ${box('CFOP', esc(cfops), 'mono')}
    ${box('Protocolo de autorização', esc(d.protocol ?? ''), 'mono')}
    ${box('Data do protocolo', esc([fmtDate(d.protocolAt), fmtTime(d.protocolAt)].join(' ').trim()), 'mono')}
  </div>
  ${party('Destinatário / remetente', recipient)}
  <div class="grid g-dates">
    ${box('Data de emissão', esc(`${fmtDate(d.issuedAt)} ${fmtTime(d.issuedAt)}`), 'mono')}
    ${box('Data de saída / entrada', esc([fmtDate(d.exitAt), fmtTime(d.exitAt)].join(' ').trim()), 'mono')}
    ${box('Modalidade do frete', esc(d.modFrete ? MOD_FRETE[d.modFrete] ?? d.modFrete : ''))}
  </div>

  <div class="bt">Cálculo do imposto</div>
  <div class="grid g-tax">
    ${box('Base de cálculo ICMS', dec(d.vBc, 2))}
    ${box('Valor do ICMS', dec(d.vIcms, 2))}
    ${box('Valor do PIS', dec(d.vPis, 2))}
    ${box('Valor da COFINS', dec(d.vCofins, 2))}
    ${box('Valor do IBS', dec(d.vIbs, 2))}
    ${box('Valor da CBS', dec(d.vCbs, 2))}
    ${box('Valor do IPI', dec(d.vIpi, 2))}
    ${box('Valor dos produtos', dec(d.vProd, 2))}
    ${box('Frete', dec(d.vFrete, 2))}
    ${box('Seguro', dec(d.vSeg, 2))}
    ${box('Desconto', dec(d.vDesc, 2))}
    ${box('Outras despesas', dec(d.vOutro, 2))}
    ${box('Valor total da nota', brl(d.total), 'big span2')}
  </div>

  <div class="bt">Dados dos produtos / serviços</div>
  <table class="g-items">
    <thead><tr>
      <th class="c">#</th><th>Código · descrição</th><th>NCM</th><th>CFOP</th><th class="c">Un</th><th class="r">Qtd</th><th class="r">V. unit</th><th class="r">V. total</th>
      <th class="c">CST ICMS</th><th class="c">CST IBS/CBS</th><th class="c">cClassTrib</th><th class="r">vIBS</th><th class="r">vCBS</th>
    </tr></thead>
    <tbody>${items}</tbody>
  </table>

  <div class="bt">Dados adicionais</div>
  <div class="addinfo">${esc(d.additionalInfo) || '<span class="muted">Sem informações complementares.</span>'}</div>
</section>`}

<section class="diag">
  <h2>Diagnóstico Nay Fiscal</h2>
  <div class="summary ${sumCls}">
    <div><b>${d.cancelled ? 'Cancelada' : `${oks.length} de ${checks.length} verificações ok`}</b><div class="muted">${esc(summaryHint)}</div></div>
    <div class="counts">
      ${nErr ? `<span class="tag erro">${nErr} ${nErr === 1 ? 'erro' : 'erros'}</span>` : ''}
      ${nAtt ? `<span class="tag atencao">${nAtt} atenção</span>` : ''}
      <span class="tag ok">${oks.length} ok</span>
    </div>
  </div>
  ${problems.map(findingCard).join('')}
  ${oks.length ? `<div class="bt">Verificações conformes</div><ul class="oks">${oks.map((o) => `<li>${esc(o.title)}</li>`).join('')}</ul>` : ''}
</section>

<footer class="foot">
  <span>Gerado pela Nay Fiscal em ${esc(fmtDate(now))} às ${esc(fmtTime(now).slice(0, 5))}</span>
  <span class="mono">${esc(d.key)}</span>
</footer>
</body>
</html>`;
}
