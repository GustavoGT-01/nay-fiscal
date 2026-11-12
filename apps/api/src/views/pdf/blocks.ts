import type { FindingDTO } from '@nay/shared';
import { box, esc, fmtCep, fmtDoc, SEV_LABEL } from './format.js';

export function party(title: string, p: { name: string; cnpj: string; street: string; number: string; complement: string; district: string; cep: string; city: string; uf: string; ie: string }) {
  const street = [p.street, p.number].filter(Boolean).join(', ') + (p.complement ? ` - ${p.complement}` : '');
  return `
  <div class="block">
    <div class="bt">${esc(title)}</div>
    <div class="grid g-party">
      ${box('Nome / razão social', esc(p.name), 'span3')}
      ${box('CNPJ / CPF', esc(fmtDoc(p.cnpj)), 'mono')}
      ${box('Endereço', esc(street), 'span2')}
      ${box('Bairro', esc(p.district))}
      ${box('CEP', esc(fmtCep(p.cep)), 'mono')}
      ${box('Município', esc(p.city), 'span2')}
      ${box('UF', esc(p.uf))}
      ${box('Inscrição estadual', esc(p.ie), 'mono')}
    </div>
  </div>`;
}

export function findingCard(f: FindingDTO) {
  const sev = f.severity === 'a_verificar' ? 'atencao' : f.severity;
  const row = (label: string, v: string | null) => (v ? `<li><b>${label}:</b> ${esc(v)}</li>` : '');
  return `
  <div class="finding ${sev}">
    <div class="fh">
      <span class="tag ${sev}">${SEV_LABEL[f.severity] ?? esc(f.severity)}</span>
      <b>${esc(f.title)}</b>${f.itemNumber ? `<span class="muted"> · item ${f.itemNumber}</span>` : ''}
      <span class="code">${esc(f.ruleCode)}</span>
    </div>
    <div class="cmp">
      <div class="is"><small>Está no XML</small><span>${esc(f.observed)}</span></div>
      <div class="arrow">→</div>
      <div class="should"><small>Deveria ser</small><span>${esc(f.expected)}</span></div>
    </div>
    <ul class="story">
      ${row('O que aconteceu', f.what)}
      ${row('Por que importa', f.why)}
      ${row('Como corrigir', f.how)}
    </ul>
    ${f.fixTag ? `<div class="fix">Corrigir: <span>${esc(f.fixTag)}</span></div>` : ''}
    ${f.legalBasis ? `<p class="base">Base: ${esc(f.legalBasis)}. Vigência pela data de emissão.</p>` : ''}
  </div>`;
}
