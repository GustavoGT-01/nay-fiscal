import type { NfseData } from '../../xml/nfse-parser.js';
import type { Loaded } from './types.js';
import { box, brl, dec, esc, fmtDate, fmtDoc, fmtTime } from './format.js';
import { party } from './blocks.js';

const ISS_TRIB: Record<string, string> = { '1': 'Tributável', '2': 'Imunidade', '3': 'Exportação', '4': 'Não incidência' };
const ISS_RET: Record<string, string> = { '1': 'Não retido', '2': 'Retido pelo tomador', '3': 'Retido pelo intermediário' };
const OPC_SN: Record<string, string> = { '1': 'Não optante', '2': 'MEI', '3': 'Simples (ME/EPP)' };

/** Bloco da NFS-e (prestador, tomador, servico, ISS e retencoes) no lugar do DANFE. */
export function nfseSection(d: Loaded['doc'], tomador: Parameters<typeof party>[1]) {
  const s = JSON.parse(d.nfse ?? '{}') as NfseData;
  const prestAddr = [[d.emitterStreet, d.emitterNumber].filter(Boolean).join(', '), d.emitterDistrict, d.emitterCity && `${d.emitterCity}/${d.emitterUf}`].filter(Boolean).join(' - ');
  const pct = (v: number) => `${(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  return `<section>
  <div class="grid g-top">
    <div class="f emit">
      <small>Prestador do serviço</small>
      <b>${esc(d.emitterName)}</b>
      <div>${esc(prestAddr)}</div>
      <div class="mono">CNPJ ${esc(fmtDoc(d.emitterCnpj))}${s.providerIm ? ` · IM ${esc(s.providerIm)}` : ''}</div>
      <div>${esc(OPC_SN[s.simplesOption] ?? '')}</div>
    </div>
    <div class="f"><small>Número da NFS-e</small><span class="mono" style="font-size:10pt;font-weight:600">Nº ${esc(d.number)}</span></div>
    <div class="f"><small>Competência</small><span class="mono">${esc(s.competence ? s.competence.split('-').reverse().join('/') : fmtDate(d.issuedAt))}</span></div>
    <div class="f span2"><small>Chave de acesso</small><span class="mono" style="font-size:7.5pt">${esc(d.key)}</span></div>
  </div>
  ${party('Tomador do serviço', tomador)}
  <div class="bt">Serviço</div>
  <div class="grid" style="grid-template-columns:1fr 3fr">
    ${box('Código nacional', esc(s.serviceCode), 'mono')}
    ${box('Descrição', esc(s.description || d.natOp))}
    ${box('Local de incidência do ISS', esc(s.incidenceCity || s.incidenceCityCode))}
    ${box('Data de emissão', esc(`${fmtDate(d.issuedAt)} ${fmtTime(d.issuedAt)}`), 'mono')}
  </div>
  <div class="bt">ISS e valores</div>
  <div class="grid g-tax">
    ${box('Valor do serviço', dec(s.serviceValue, 2))}
    ${box('Descontos', dec(s.discounts, 2))}
    ${box('Base de cálculo', dec(s.issBase, 2))}
    ${box('Alíquota', pct(s.issRate))}
    ${box('ISS', dec(s.issValue, 2))}
    ${box('Tributação', esc(ISS_TRIB[s.issTributacao] ?? ''))}
    ${box('Retenção do ISS', esc(ISS_RET[s.issRetention] ?? ''))}
    ${box('IRRF', dec(s.retIrrf, 2))}
    ${box('CSLL', dec(s.retCsll, 2))}
    ${box('PIS + COFINS retidos', dec(s.retPis + s.retCofins, 2))}
    ${box('INSS (CP)', dec(s.retCp, 2))}
    ${box('Total retido', dec(s.retentionsTotal, 2))}
    ${box('Valor líquido', brl(s.netValue), 'big span2')}
  </div>
  <div class="bt">Informações complementares</div>
  <div class="addinfo">${esc(d.additionalInfo) || '<span class="muted">Sem informações complementares.</span>'}</div>
</section>`;
}
