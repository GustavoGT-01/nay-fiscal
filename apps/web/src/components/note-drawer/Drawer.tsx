import { useEffect, useRef, useState } from 'react';
import { Seg, useToast } from '../../lib/ui';
import { brl, fmtCnpj, fmtDate } from '../../lib/api';
import { useSession } from '../../lib/session';
import { printNote } from '../../lib/print';
import { useNote } from '../../hooks/useNotes';
import { Finding } from './Finding';
import { VerdictBanner } from './VerdictBanner';
import { DeleteNoteButton } from './DeleteNoteButton';
import { NfeView } from './NfeView';
import { NfseView } from './NfseView';
import { docName } from './docName';

type Filter = 'todos' | 'erro' | 'atencao' | 'ok';

/** Gera o PDF da nota (HTML A4 impresso pelo navegador). */
function PdfButton({ id, number }: { id: string | null; number?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!id) return;
    setBusy(true);
    try { await printNote(id, number); } catch { toast('Não foi possível gerar o PDF. Tente de novo.'); } finally { setBusy(false); }
  };
  return (
    <button className="btn" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={go} disabled={!id || busy} aria-label="Gerar PDF da nota">
      <i className="ti ti-printer" />PDF
    </button>
  );
}

export function NoteDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { client } = useSession();
  const [filter, setFilter] = useState<Filter>('todos');
  const [openIdx, setOpenIdx] = useState<Set<string>>(new Set());
  const [ringPct, setRingPct] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const q = useNote(id);
  const n = q.data;

  useEffect(() => {
    if (!id) return;
    setFilter('todos');
    setRingPct(0);
    setTimeout(() => closeRef.current?.focus(), 60);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [id, onClose]);

  const checks = n?.checks ?? [];
  const c = {
    erro: checks.filter((x) => x.severity === 'erro').length,
    atencao: checks.filter((x) => x.severity === 'atencao' || x.severity === 'a_verificar').length,
    ok: checks.filter((x) => x.severity === 'ok').length,
  };
  const pct = checks.length ? Math.round((c.ok / checks.length) * 100) : 0;

  useEffect(() => {
    if (!n) return;
    const first = n.checks.find((x) => x.severity === 'erro');
    setOpenIdx(new Set(first ? [first.id] : []));
    const t = setTimeout(() => setRingPct(pct), 250);
    return () => clearTimeout(t);
  }, [n, pct]);

  const list = checks.filter((x) => filter === 'todos' || x.severity === filter || (filter === 'atencao' && x.severity === 'a_verificar'));
  const cancelled = n?.status === 'cancelada';
  const ringStroke = c.erro ? 'var(--caju)' : c.atencao ? 'var(--maracuja)' : 'var(--limao)';
  const docLabel = n ? docName(n.model) : '';

  return (
    <>
      <div className={'scrim' + (id ? ' on' : '')} onClick={onClose} />
      <aside className={'drawer' + (id ? ' on' : '')} role="dialog" aria-modal="true" aria-labelledby="dTitle" aria-hidden={!id}>
        <div className="d-head">
          <div className="row">
            <div>
              <h2 id="dTitle">{n ? `${docLabel} ${n.number}, ${brl(n.total)}` : 'Carregando…'}</h2>
              <p>{n ? (n.nfse ? `Emitida em ${fmtDate(n.issuedAt)}, serviço ${n.nfse.serviceCode}` : `Emitida em ${fmtDate(n.issuedAt)}, CFOP ${n.cfop}`) : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <PdfButton id={id} number={n?.number} />
              {n && <DeleteNoteButton id={n.id} label={`${docLabel} ${n.number}`} onDeleted={onClose} />}
              <button className="icon-btn" ref={closeRef} onClick={onClose} aria-label="Fechar"><i className="ti ti-x" /></button>
            </div>
          </div>
          {n && (
            <div className="flow">
              <span>{n.emitter.name}</span>
              <i className="ti ti-arrow-narrow-right" style={{ color: 'var(--muted)' }} />
              <span>{n.recipient.name || client?.name}</span>
            </div>
          )}
        </div>
        <div className="d-body">
          {q.isError && <div className="err-box">Não foi possível abrir a nota. Tente de novo.</div>}
          {!n && !q.isError && <div className="skel" style={{ height: 120 }} />}
          {n && (
            <>
              <VerdictBanner n={n} />
              <div className="score">
                <svg className="ring" viewBox="0 0 60 60">
                  <circle className="bg" cx="30" cy="30" r="25" />
                  <circle className="fg" cx="30" cy="30" r="25" strokeDasharray="157" strokeDashoffset={157 - (157 * ringPct) / 100} style={{ stroke: ringStroke }} />
                </svg>
                <div>
                  <strong style={{ font: '800 22px var(--display)' }}>{cancelled ? 'Cancelada' : `${c.ok} de ${checks.length} verificações ok`}</strong>
                  <div className="hint">
                    {cancelled ? 'Nota cancelada na SEFAZ, fora da apuração.' : c.erro ? 'Corrija os erros antes de escriturar.' : c.atencao ? 'Sem erros. Vale revisar os pontos de atenção.' : 'Nota pronta para escriturar.'}
                  </div>
                </div>
              </div>
              <Seg<Filter>
                style={{ marginBottom: 14 }}
                label="Filtrar verificações"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'todos', label: `Todos ${checks.length}` },
                  { value: 'erro', label: `Erros ${c.erro}` },
                  { value: 'atencao', label: `Atenção ${c.atencao}` },
                  { value: 'ok', label: `OK ${c.ok}` },
                ]}
              />
              {list.map((f) => (
                <Finding key={f.id} f={f} note={n} open={openIdx.has(f.id)} onToggle={() => setOpenIdx((s) => { const x = new Set(s); x.has(f.id) ? x.delete(f.id) : x.add(f.id); return x; })} />
              ))}
              {!list.length && <p className="hint" style={{ textAlign: 'center', padding: 30 }}>Nada nesta categoria.</p>}

              {n.nfse ? <NfseView s={n.nfse} /> : <NfeView n={n} />}
              <p className="chip-key" style={{ marginTop: 14 }}>Chave {n.key} · Emitente {fmtCnpj(n.emitter.cnpj)}{n.protocol ? ` · Protocolo ${n.protocol}` : ''}</p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
