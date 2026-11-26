import { useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { NoteRowDTO } from '@nay/shared';
import { brl, fmtCnpj, fmtDate } from '../lib/api';
import { useSession } from '../lib/session';
import { QueryError, Seg, StatusTag, useToast } from '../lib/ui';
import { Pager, rowProps } from '../lib/widgets';
import { printNote } from '../lib/print';
import { docName, useOpenNote } from '../components/note-drawer';
import { DirectionSeg, useDirection } from '../lib/direction';
import { VERDICT } from '../lib/verdict';
import { NOTES_PER_PAGE as PER, useNotes, type SortKey } from '../hooks/useNotes';

type S = 'all' | 'erro' | 'ok' | 'cancelada';
type Order = 'asc' | 'desc';
export interface SortState { by: SortKey; order: Order }

const MODELOS = [
  { value: '', label: 'Todos os modelos' }, { value: '55', label: 'NF-e (55)' }, { value: '65', label: 'NFC-e (65)' },
  { value: '57', label: 'CT-e (57)' }, { value: 'NFSE', label: 'NFS-e' },
];
const dm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/** Cabecalho que ordena ao clique. Sem `sort`, e texto simples (a tabela tambem serve a telas sem ordenacao). */
function Th({ k, sort, onSort, children, className }: { k: SortKey; sort?: SortState; onSort?: (k: SortKey) => void; children: string; className?: string }) {
  if (!sort || !onSort) return <th scope="col" className={className}>{children}</th>;
  const on = sort.by === k;
  return (
    <th scope="col" className={className} aria-sort={on ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(k)}>
        {children}<i className={'ti ' + (on ? (sort.order === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort')} aria-hidden="true" />
      </button>
    </th>
  );
}

export function NotesTable({ rows, empty, onOpen, sort, onSort }: { rows: NoteRowDTO[]; empty: string; onOpen: (id: string) => void; sort?: SortState; onSort?: (k: SortKey) => void }) {
  const toast = useToast();
  const pdf = (e: MouseEvent, n: NoteRowDTO) => {
    e.stopPropagation();
    printNote(n.id, n.number).catch(() => toast('Não foi possível gerar o PDF. Tente de novo.'));
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Nota</th>
          <Th k="emitterName" sort={sort} onSort={onSort}>Fornecedor ou cliente</Th>
          <Th k="issuedAt" sort={sort} onSort={onSort}>Emissão</Th>
          <th scope="col">CFOP</th>
          <Th k="total" sort={sort} onSort={onSort} className="r">Valor</Th>
          <Th k="status" sort={sort} onSort={onSort}>Situação</Th>
          <th scope="col" aria-label="PDF" />
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} {...rowProps(() => onOpen(n.id))}>
            <td><b className="num" style={{ fontWeight: 700 }}>{docName(n.model)} {n.number}</b></td>
            <td>{n.counterpart}{n.direction === 'saida' && <span className="hint"> · saída</span>}</td>
            <td>{fmtDate(n.issuedAt)}</td>
            <td className="mono">{n.cfop}</td>
            <td className="r num">{brl(n.total)}</td>
            <td><StatusTag status={n.status} /></td>
            <td className="r" style={{ width: 44 }}>
              <button className="icon-btn" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 16 }} title="Gerar PDF" aria-label={`Gerar PDF da nota ${n.number}`} onClick={(e) => pdf(e, n)}>
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

function FilterChip({ children, onClear, label }: { children: string; onClear: () => void; label: string }) {
  return <span className="chip">{children}<button type="button" aria-label={label} onClick={onClear}><i className="ti ti-x" /></button></span>;
}

export function Notas() {
  const { client } = useSession();
  const openNote = useOpenNote();
  const [params, setParams] = useSearchParams();
  const [direction, setDirection] = useDirection();
  // valor desconhecido na URL (link antigo, texto digitado) e ignorado: a API recusa veredito fora da lista
  const rawVerdict = params.get('veredito') ?? '';
  const verdict = (rawVerdict in VERDICT ? rawVerdict : '') as keyof typeof VERDICT | '';
  const [text, setText] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<S>('all');
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cfop, setCfop] = useState('');
  const [model, setModel] = useState('');
  const [sort, setSort] = useState<SortState>({ by: 'issuedAt', order: 'desc' });
  const supplier = params.get('fornecedor') ?? '';

  // CFOP so vai para a API com 4 digitos; antes disso a lista nao muda
  const cfopOk = /^\d{4}$/.test(cfop) ? cfop : '';
  const q = useNotes(client?.id, { status, text, page, supplier, direction, verdict, from, to, cfop: cfopOk, model, sort: sort.by, order: sort.order });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  const onSort = (k: SortKey) => { setSort((s) => (s.by === k ? { by: k, order: s.order === 'asc' ? 'desc' : 'asc' } : { by: k, order: k === 'emitterName' || k === 'status' ? 'asc' : 'desc' })); setPage(0); };
  const dropParam = (name: string) => { params.delete(name); setParams(params); setPage(0); };

  const periodo = from && to ? `Período ${dm(from)} a ${dm(to)}` : from ? `A partir de ${dm(from)}` : to ? `Até ${dm(to)}` : '';
  const hasChips = !!(periodo || cfopOk || supplier || model);

  return (
    <section className="view on" aria-labelledby="h-notas">
      <h1 id="h-notas">Notas</h1>
      <p className="lede">Todas as notas da carteira. Clique em uma linha para ver o diagnóstico; o endereço da página guarda a nota aberta, então dá para copiar o link.</p>
      <div className="toolbar">
        <div className="input">
          <i className="ti ti-search" style={{ color: 'var(--muted)' }} />
          <input value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Número, fornecedor, chave ou CFOP" aria-label="Filtrar notas" />
        </div>
        <Seg<S>
          label="Situação"
          value={status}
          onChange={reset(setStatus)}
          options={[{ value: 'all', label: 'Todas' }, { value: 'erro', label: 'Com erro' }, { value: 'ok', label: 'Conformes' }, { value: 'cancelada', label: 'Canceladas' }]}
        />
        <DirectionSeg value={direction} onChange={(v) => { setDirection(v); setPage(0); }} />
        {verdict && VERDICT[verdict] && (
          <button className={'tag ' + VERDICT[verdict].cls} style={{ border: 0, cursor: 'pointer' }} onClick={() => dropParam('veredito')} aria-label="Limpar filtro de veredito">
            {VERDICT[verdict].label}<i className="ti ti-x" />
          </button>
        )}
      </div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <label className="hint" htmlFor="f-de">De</label>
        <div className="input" style={{ width: 150 }}><input id="f-de" type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /></div>
        <label className="hint" htmlFor="f-ate">até</label>
        <div className="input" style={{ width: 150 }}><input id="f-ate" type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></div>
        <label className="hint" htmlFor="f-cfop">CFOP</label>
        <div className="input" style={{ width: 110 }}><input id="f-cfop" inputMode="numeric" maxLength={4} placeholder="6912" value={cfop} onChange={(e) => reset(setCfop)(e.target.value.replace(/\D/g, ''))} /></div>
        <select className="select" style={{ width: 'auto', paddingRight: 40 }} aria-label="Tipo de documento" value={model} onChange={(e) => reset(setModel)(e.target.value)}>
          {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      {hasChips && (
        <div className="chips" style={{ marginBottom: 12 }}>
          <span className="hint">Filtrando por:</span>
          {periodo && <FilterChip label="Limpar período" onClear={() => { setFrom(''); setTo(''); setPage(0); }}>{periodo}</FilterChip>}
          {cfopOk && <FilterChip label="Limpar CFOP" onClear={() => { setCfop(''); setPage(0); }}>{'CFOP ' + cfopOk}</FilterChip>}
          {model && <FilterChip label="Limpar modelo" onClear={() => { setModel(''); setPage(0); }}>{MODELOS.find((m) => m.value === model)?.label ?? model}</FilterChip>}
          {supplier && <FilterChip label="Limpar fornecedor" onClear={() => dropParam('fornecedor')}>{'Fornecedor ' + (supplier.length === 14 ? fmtCnpj(supplier) : supplier)}</FilterChip>}
        </div>
      )}
      <div className="table-wrap">
        {q.isLoading ? <div className="skel" style={{ height: 300, margin: 16 }} /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} what="as notas" /> : (
          <NotesTable rows={q.data?.rows ?? []} onOpen={openNote} sort={sort} onSort={onSort} empty="Nenhuma nota encontrada. Tente outro filtro ou limpe as etiquetas." />
        )}
        {!q.isError && (
          <Pager summary={`${total} notas`} page={page} pages={pages} onPage={setPage} />
        )}
      </div>
    </section>
  );
}
