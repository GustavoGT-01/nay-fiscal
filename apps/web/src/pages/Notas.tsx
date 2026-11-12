import { useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { NoteRowDTO } from '@nay/shared';
import { brl, fmtDate } from '../lib/api';
import { useSession } from '../lib/session';
import { Seg, StatusTag, useToast } from '../lib/ui';
import { printNote } from '../lib/print';
import { docName, useOpenNote } from '../components/note-drawer';
import { DirectionSeg, useDirection } from '../lib/direction';
import { VERDICT } from '../lib/verdict';
import { NOTES_PER_PAGE as PER, useNotes } from '../hooks/useNotes';

type S = 'all' | 'erro' | 'ok' | 'cancelada';

export function NotesTable({ rows, empty, onOpen }: { rows: NoteRowDTO[]; empty: string; onOpen: (id: string) => void }) {
  const toast = useToast();
  const pdf = (e: MouseEvent, n: NoteRowDTO) => {
    e.stopPropagation();
    printNote(n.id, n.number).catch(() => toast('Não foi possível gerar o PDF. Tente de novo.'));
  };
  return (
    <table className="table">
      <thead><tr><th>Nota</th><th>Fornecedor ou cliente</th><th>Emissão</th><th>CFOP</th><th className="r">Valor</th><th>Situação</th><th aria-label="PDF" /></tr></thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} tabIndex={0} onClick={() => onOpen(n.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(n.id)}>
            <td><b className="num" style={{ fontWeight: 700 }}>{docName(n.model)} {n.number}</b></td>
            <td>{n.counterpart}{n.direction === 'saida' && <span className="hint"> · saída</span>}</td>
            <td>{fmtDate(n.issuedAt)}</td>
            <td className="mono">{n.cfop}</td>
            <td className="r num">{brl(n.total)}</td>
            <td><StatusTag status={n.status} /></td>
            <td className="r" style={{ width: 44 }}>
              <button className="icon-btn" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 16 }} title="Gerar PDF" aria-label={`Gerar PDF da nota ${n.number}`} onClick={(e) => pdf(e, n)} onKeyDown={(e) => e.stopPropagation()}>
                <i className="ti ti-printer" />
              </button>
            </td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>{empty}</td></tr>}
      </tbody>
    </table>
  );
}

export function Notas() {
  const { client } = useSession();
  const openNote = useOpenNote();
  const [params, setParams] = useSearchParams();
  const [direction, setDirection] = useDirection();
  const verdict = (params.get('veredito') ?? '') as keyof typeof VERDICT | '';
  const [text, setText] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<S>('all');
  const [page, setPage] = useState(0);
  const supplier = params.get('fornecedor') ?? '';

  const q = useNotes(client?.id, { status, text, page, supplier, direction, verdict });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <section className="view on" aria-labelledby="h-notas">
      <h1 id="h-notas">Notas</h1>
      <p className="lede">Todas as notas da carteira. Clique em uma linha para ver o diagnóstico completo.</p>
      <div className="toolbar">
        <div className="input">
          <i className="ti ti-search" style={{ color: 'var(--muted)' }} />
          <input value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Número, fornecedor ou CFOP" aria-label="Filtrar notas" />
        </div>
        <Seg<S>
          label="Situação"
          value={status}
          onChange={(v) => { setStatus(v); setPage(0); }}
          options={[{ value: 'all', label: 'Todas' }, { value: 'erro', label: 'Com erro' }, { value: 'ok', label: 'Conformes' }, { value: 'cancelada', label: 'Canceladas' }]}
        />
        <DirectionSeg value={direction} onChange={(v) => { setDirection(v); setPage(0); }} />
        {supplier && <span className="tag neutro">Filtrado por fornecedor</span>}
        {verdict && VERDICT[verdict] && (
          <button className={'tag ' + VERDICT[verdict].cls} style={{ border: 0, cursor: 'pointer' }} onClick={() => { params.delete('veredito'); setParams(params); setPage(0); }} aria-label="Limpar filtro de veredito">
            {VERDICT[verdict].label}<i className="ti ti-x" />
          </button>
        )}
      </div>
      <div className="table-wrap">
        {q.isLoading ? <div className="skel" style={{ height: 300, margin: 16 }} /> : (
          <NotesTable rows={q.data?.rows ?? []} onOpen={openNote} empty="Nenhuma nota encontrada. Tente outro número ou limpe o filtro." />
        )}
        <div className="pager">
          <span>{total} notas, página {page + 1} de {pages}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn" aria-label="Página anterior" onClick={() => setPage((p) => Math.max(0, p - 1))}><i className="ti ti-chevron-left" /></button>
            <button className="btn" aria-label="Próxima página" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}><i className="ti ti-chevron-right" /></button>
          </span>
        </div>
      </div>
    </section>
  );
}
