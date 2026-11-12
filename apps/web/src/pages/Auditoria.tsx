import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, download } from '../lib/api';
import { useSession } from '../lib/session';
import { Seg, SEV_LABEL, sevClass, StatusTag, useToast } from '../lib/ui';
import { useOpenNote } from '../components/note-drawer';
import { DirectionSeg, useDirection } from '../lib/direction';
import { useAudit, type AuditMode as Mode } from '../hooks/useAudit';

function monthRange(offset: number) {
  const d = new Date();
  const a = new Date(d.getFullYear(), d.getMonth() - offset, 1);
  const b = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { from: f(a), to: f(b), label: a.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
}
const PERIODS = [{ key: 'all', label: 'Período: todas', from: '', to: '' }, ...[0, 1, 2].map((o) => { const r = monthRange(o); return { key: 'm' + o, label: r.label[0].toUpperCase() + r.label.slice(1), from: r.from, to: r.to }; })];

export function Auditoria() {
  const { client, can } = useSession();
  const openNote = useOpenNote();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('regra');
  const [period, setPeriod] = useState('all');
  const [open, setOpen] = useState<Set<string>>(new Set(params.get('regra') ? [params.get('regra')!] : []));
  const [run, setRun] = useState<{ id: string; pct: number } | null>(null);
  const [direction, setDirection] = useDirection();
  const p = PERIODS.find((x) => x.key === period)!;
  const qs = `clientId=${client?.id}${p.from ? `&from=${p.from}&to=${p.to}` : ''}&direction=${direction}`;

  const { rules, notes, sups } = useAudit(client?.id, qs, mode);

  // acompanha a auditoria em andamento
  useEffect(() => {
    if (!run || run.pct >= 100) return;
    const t = setInterval(async () => {
      const r = await api<{ status: string; total: number; processed: number }>(`/api/audit/runs/${run.id}`);
      const pct = r.total ? Math.round((r.processed / r.total) * 100) : 100;
      setRun({ id: run.id, pct });
      if (r.status !== 'RODANDO') {
        clearInterval(t);
        setTimeout(() => setRun(null), 500);
        qc.invalidateQueries();
        toast(r.status === 'CONCLUIDA' ? `Auditoria concluída: ${r.total} notas` : 'A auditoria parou com erro. Tente de novo.', r.status === 'CONCLUIDA' ? 'ti-circle-check' : 'ti-alert-triangle');
      }
    }, 500);
    return () => clearInterval(t);
  }, [run, qc, toast]);

  const startRun = async () => {
    try {
      const r = await api<{ id: string }>('/api/audit/run', { method: 'POST', body: JSON.stringify({ clientId: client!.id, from: p.from || undefined, to: p.to || undefined }) });
      setRun({ id: r.id, pct: 0 });
    } catch (e) {
      toast((e as Error).message, 'ti-alert-triangle');
    }
  };

  const exportAs = async (format: 'xlsx' | 'csv') => {
    try {
      await download(`/api/audit/export?${qs}&format=${format}`, `auditoria-${client!.cnpj}.${format}`);
      toast(format === 'xlsx' ? 'Planilha da auditoria exportada' : 'CSV da auditoria exportado', 'ti-download');
    } catch (e) {
      toast((e as Error).message, 'ti-alert-triangle');
    }
  };
  const [expOpen, setExpOpen] = useState(false);

  const toggle = (code: string) => setOpen((s) => { const x = new Set(s); x.has(code) ? x.delete(code) : x.add(code); return x; });

  return (
    <section className="view on" aria-labelledby="h-aud">
      <div className="hello">
        <div><h1 id="h-aud">Auditoria</h1><p className="lede"><span className="cname">{client?.name}</span>, {p.key === 'all' ? 'todas as notas do período.' : 'notas de ' + p.label.toLowerCase() + '.'}</p></div>
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button className="btn" onClick={() => setExpOpen((x) => !x)} aria-expanded={expOpen}><i className="ti ti-download" />Exportar</button>
          <div className={'menu' + (expOpen ? ' open' : '')} style={{ top: 'calc(100% + 6px)', left: 0 }} onMouseLeave={() => setExpOpen(false)}>
            <button onClick={() => { setExpOpen(false); exportAs('xlsx'); }}><span>Planilha Excel (.xlsx)</span><span>resumo + achados</span></button>
            <button onClick={() => { setExpOpen(false); exportAs('csv'); }}><span>Arquivo CSV</span><span>Excel pt-BR</span></button>
            <button onClick={() => { setExpOpen(false); window.print(); }}><span>Imprimir ou PDF</span><span>tela atual</span></button>
          </div>
          {can('auditoria.rodar') && (
            <button className="btn primary" onClick={startRun} disabled={!!run}>
              <i className={'ti ' + (run ? 'ti-loader-2' : 'ti-player-play')} />{run ? 'Auditando notas' : 'Rodar auditoria'}
            </button>
          )}
        </div>
      </div>
      <div className={'runbar' + (run ? ' on' : '')}><div style={{ width: (run?.pct ?? 0) + '%', transition: 'width .4s' }} /></div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <Seg<Mode> label="Agrupar" value={mode} onChange={setMode} options={[{ value: 'regra', label: 'Por regra' }, { value: 'nota', label: 'Por nota' }, { value: 'forn', label: direction === 'saida' ? 'Por cliente' : direction === 'all' ? 'Por fornecedor ou cliente' : 'Por fornecedor' }]} />
        <DirectionSeg value={direction} onChange={setDirection} />
        <select className="select" style={{ width: 'auto', marginLeft: 'auto', paddingRight: 40 }} aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </div>

      {mode === 'regra' && (
        <div>
          {rules.isLoading && <div className="skel" style={{ height: 240 }} />}
          {rules.data?.length === 0 && <div className="panel"><p className="hint">Nenhum achado neste período. As notas estão em conformidade.</p></div>}
          {rules.data?.map((r) => {
            const isOpen = open.has(r.code);
            return (
              <div key={r.code} className={`rule ${sevClass(r.severity)}${isOpen ? ' open' : ''}`}>
                <button className="rule-h" aria-expanded={isOpen} onClick={() => toggle(r.code)}>
                  <span className={'tag ' + sevClass(r.severity)}>{SEV_LABEL[r.severity]}</span>
                  <h3>{r.title}</h3>
                  <span className="count">{r.items}<small>itens, {r.notes} {r.notes === 1 ? 'nota' : 'notas'}</small></span>
                  <i className="ti ti-chevron-down chev" />
                </button>
                <div className="rule-b"><div><div className="rule-in">
                  <p>{r.description}</p>
                  {r.fixTag && (
                    <div className="code">
                      <span>Corrigir: <span className="add">{r.fixTag}</span></span>
                      <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(r.fixTag!); toast('Correção copiada'); }}><i className="ti ti-copy" />Copiar</button>
                    </div>
                  )}
                  <div className="minirows">
                    {r.sampleNotes.map((n) => <button key={n.id} className="chip-note" onClick={() => openNote(n.id)}>NF-e {n.number}</button>)}
                  </div>
                </div></div></div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'nota' && (
        <div className="table-wrap">
          {notes.isLoading ? <div className="skel" style={{ height: 240, margin: 16 }} /> : (
            <table className="table">
              <thead><tr><th>Nota</th><th>{direction === 'saida' ? 'Cliente' : direction === 'all' ? 'Fornecedor ou cliente' : 'Fornecedor'}</th><th>Achados</th><th>Situação</th></tr></thead>
              <tbody>
                {notes.data?.rows.map((n) => (
                  <tr key={n.id} tabIndex={0} onClick={() => openNote(n.id)} onKeyDown={(e) => e.key === 'Enter' && openNote(n.id)}>
                    <td><b className="num">NF-e {n.number}</b></td><td>{n.counterpart}</td>
                    <td>{n.findings.filter((f) => f.severity !== 'a_verificar').map((f) => f.title).join('; ')}</td>
                    <td><StatusTag status={n.status} /></td>
                  </tr>
                ))}
                {notes.data?.rows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhuma nota com achados neste período.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {mode === 'forn' && (
        <div className="groups">
          {sups.isLoading && <div className="skel" style={{ height: 120 }} />}
          {sups.data?.map((s) => {
            const o = s.notes - s.withError - s.withAttention;
            return (
              <button key={s.cnpj} className="gcard" onClick={() => nav(`/notas?fornecedor=${s.cnpj}`)}>
                <h3>{s.name}</h3>
                <div className="meter">
                  <i style={{ width: (o / s.notes) * 100 + '%', background: 'var(--limao)' }} />
                  <i style={{ width: (s.withAttention / s.notes) * 100 + '%', background: 'var(--maracuja)' }} />
                  <i style={{ width: (s.withError / s.notes) * 100 + '%', background: 'var(--caju)' }} />
                </div>
                <small>{s.notes} notas: {s.withError} com erro, {s.withAttention} com atenção</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
