import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SCREENS } from '@nay/shared';
import { brl } from '../lib/api';
import { useSession } from '../lib/session';
import { useOpenNote } from './note-drawer';
import { useNoteSearch } from '../hooks/useNotes';

type Item = { type: 'v'; path: string; icon: string; t: string; s: string } | { type: 'n'; id: string; icon: string; t: string; s: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const openNote = useOpenNote();
  const { client, can } = useSession();

  useEffect(() => {
    // foco imediato: quem digita logo apos Ctrl K nao perde letras
    if (open) { setQ(''); setSel(0); input.current?.focus(); }
  }, [open]);

  const notes = useNoteSearch(client?.id, q, open && !!client && q.trim().length >= 2 && can('notas'));

  const ql = q.trim().toLowerCase();
  const items: Item[] = [
    ...SCREENS.filter((s) => can(s.key) && s.label.toLowerCase().includes(ql)).map((s) => ({ type: 'v' as const, path: s.path, icon: 'ti-' + s.icon, t: s.label, s: 'Tela' })),
    ...(ql.length >= 2 ? notes.data?.rows ?? [] : []).map((n) => ({ type: 'n' as const, id: n.id, icon: 'ti-file-invoice', t: `NF-e ${n.number}, ${n.counterpart}`, s: brl(n.total) })),
  ];
  const cur = Math.min(sel, Math.max(0, items.length - 1));

  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    if (it.type === 'v') nav(it.path);
    else openNote(it.id);
  };

  return (
    <>
      <div className={'scrim2' + (open ? ' on' : '')} onClick={onClose} />
      <div className={'cmdk' + (open ? ' on' : '')} role="dialog" aria-label="Buscar" aria-hidden={!open}>
        <div className="in">
          <i className="ti ti-search" style={{ color: 'var(--muted)' }} />
          <input
            ref={input}
            value={q}
            placeholder="Ir para tela ou abrir nota (ex.: 4236)"
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { setSel(Math.min(items.length - 1, cur + 1)); e.preventDefault(); }
              if (e.key === 'ArrowUp') { setSel(Math.max(0, cur - 1)); e.preventDefault(); }
              if (e.key === 'Enter') run(items[cur]);
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <ul>
          {items.map((it, i) => (
            <li key={i} className={i === cur ? 'sel' : ''} onClick={() => run(it)} onMouseEnter={() => setSel(i)}>
              <i className={'ti ' + it.icon} />{it.t}<small>{it.s}</small>
            </li>
          ))}
          {!items.length && <li style={{ color: 'var(--muted)' }}>{notes.isFetching ? 'Buscando…' : 'Nada encontrado. Tente o número da nota.'}</li>}
        </ul>
      </div>
    </>
  );
}
