import { useState } from 'react';
import type { FindingDTO, NoteDetailDTO } from '@nay/shared';
import { useToast } from '../../lib/ui';
import { actionLabel } from '../../lib/verdict';

function XmlView({ snippet, highlight }: { snippet: string; highlight: string | null }) {
  const lines = snippet.split('\n');
  // destaca a linha da tag do campo (ou o bloco IBSCBS quando o grupo esta ausente)
  let hit = highlight ? lines.findIndex((l) => l.trim().startsWith(`<${highlight}>`) || l.trim().startsWith(`<${highlight} `)) : -1;
  if (hit < 0 && highlight === 'cClassTrib') hit = lines.findIndex((l) => l.trim().startsWith('<CST>') && /^\d{3}$/.test(l.replace(/<\/?CST>/g, '').trim()));
  return (
    <div className="xml">
      {lines.map((l, i) => {
        const t = l.trim();
        const cls = t.startsWith('<!--') ? 'c' : /^<\/?[A-Za-z]+>$/.test(t) ? 'k' : '';
        return (
          <span key={i} className={'ln' + (i === hit ? ' hl' : '')}>
            <span className={cls}>{l}</span>
          </span>
        );
      })}
    </div>
  );
}

export function Finding({ f, open, onToggle, note }: { f: FindingDTO; open: boolean; onToggle: () => void; note: NoteDetailDTO }) {
  const toast = useToast();
  const [showXml, setShowXml] = useState(false);
  const sev = f.severity === 'a_verificar' ? 'atencao' : f.severity;
  const ic = { erro: 'ti-alert-triangle', atencao: 'ti-alert-circle', ok: 'ti-circle-check' }[sev];
  if (f.severity === 'ok') {
    return (
      <div className="finding ok">
        <div className="f-h" style={{ cursor: 'default' }}><i className={'ti st ' + ic} /><span className="t">{f.title}</span></div>
      </div>
    );
  }
  const parecer = () => {
    const txt = `NF-e ${note.number}: ${f.title}. O que aconteceu: ${f.what} Por que importa: ${f.why} Como corrigir: ${f.how} Base: ${f.legalBasis}.`;
    navigator.clipboard?.writeText(txt);
    toast('Parecer copiado');
  };
  return (
    <div className={`finding ${sev}${open ? ' open' : ''}`}>
      <button className="f-h" aria-expanded={open} onClick={onToggle}>
        <i className={'ti st ' + ic} />
        <span className="t">{f.title}{f.itemNumber ? <span className="hint"> · item {f.itemNumber}</span> : null}</span>
        <span className="mono hint" style={{ fontSize: 11.5 }}>{f.ruleCode}</span>
        <i className="ti ti-chevron-down chev" />
      </button>
      <div className="f-b"><div><div className="f-in">
        <span className={'tag f-action ' + (f.severity === 'erro' ? 'erro' : 'neutro')}><i className={'ti ' + (f.severity !== 'erro' ? 'ti-eye' : note.direction === 'entrada' ? 'ti-send' : f.action === 'cancelar_reemitir' ? 'ti-refresh-alert' : 'ti-eye')} />{actionLabel(f, note.direction)}</span>
        <div className="cmp">
          <div className="is"><small>Está no XML</small><span className="mono">{f.observed}</span></div>
          <i className="ti ti-arrow-right" style={{ color: 'var(--muted)' }} />
          <div className="should"><small>Deveria ser</small><span className="mono">{f.expected}</span></div>
        </div>
        <ul className="story">
          <li><i className="ti ti-eye" /><span><b>O que aconteceu:</b> {f.what}</span></li>
          <li><i className="ti ti-scale" /><span><b>Por que importa:</b> {f.why}</span></li>
          <li><i className="ti ti-tool" /><span><b>Como corrigir:</b> {f.how}</span></li>
        </ul>
        {f.severity === 'erro' && f.action === 'cancelar_reemitir' && note.direction === 'saida' && note.cceNote && <p className="cce"><i className="ti ti-info-circle" /> {note.cceNote}</p>}
        {f.fixTag && (
          <div className="code" style={{ marginTop: 12 }}>
            <span>Corrigir: <span className="add">{f.fixTag}</span></span>
            <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(f.fixTag!); toast('Correção copiada'); }}>
              <i className="ti ti-copy" />Copiar
            </button>
          </div>
        )}
        <p className="base">Base: {f.legalBasis}. Vigência pela data de emissão.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={parecer}><i className="ti ti-copy" />Copiar parecer</button>
          {f.xmlSnippet && <button className="btn" onClick={() => setShowXml((x) => !x)}><i className="ti ti-code" />{showXml ? 'Ocultar XML' : 'Ver no XML'}</button>}
        </div>
        {showXml && f.xmlSnippet && <XmlView snippet={f.xmlSnippet} highlight={f.highlight} />}
      </div></div></div>
    </div>
  );
}
