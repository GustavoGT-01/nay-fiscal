/**
 * Pecas de interface repetidas em varias telas: contador animado, medidor, paginacao,
 * linha clicavel, menu suspenso e copiar para a area de transferencia.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useToast } from './ui';

/* ---------- Contador animado ---------- */
/** Numero que vai ate o alvo em 1,1 s (curva do mockup); numa mudanca, parte de onde estava. */
export function useCountUp(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useLayoutEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      // o mesmo relogio do inicio: o horario que o rAF entrega e o do quadro, que pode ser anterior a t0
      const k = Math.min(1, (performance.now() - t0) / 1100);
      const val = Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      from.current = val;
      setV(val);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/* ---------- Medidor em faixas ---------- */
/** Barra dividida em partes proporcionais. Parte zerada nao aparece; parte muito pequena ganha `minPx` para ser vista. */
export function Meter({ className, total, parts, minPx, stagger }: { className: string; total: number; parts: [number, string][]; minPx?: number; stagger?: number }) {
  const sum = total || 1;
  return (
    <div className={className} aria-hidden="true">
      {parts.filter(([n]) => n > 0).map(([n, color], i) => (
        <i key={color} style={{ width: `${(n / sum) * 100}%`, background: color, minWidth: minPx && n / sum < 0.03 ? minPx : undefined, animationDelay: stagger === undefined ? undefined : `${stagger + i * 0.1}s` }} />
      ))}
    </div>
  );
}

/* ---------- Paginacao ---------- */
export function Pager({ summary, page, pages, onPage }: { summary: string; page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <div className="pager">
      <span>{summary}, página {page + 1} de {pages}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn" aria-label="Página anterior" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))}><i className="ti ti-chevron-left" /></button>
        <button type="button" className="btn" aria-label="Próxima página" disabled={page >= pages - 1} onClick={() => onPage(Math.min(pages - 1, page + 1))}><i className="ti ti-chevron-right" /></button>
      </span>
    </div>
  );
}

/* ---------- Linha clicavel ---------- */
/** Linha de tabela que abre algo: clique, Enter ou Espaço. Teclas em botoes dentro da linha nao contam. */
export function rowProps(open: () => void) {
  return {
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); // Espaco nao rola a pagina
      open();
    },
  };
}

/* ---------- Menu suspenso ---------- */
/**
 * Menu que abre a partir de um botao: ao abrir, o foco vai ao primeiro item; setas, Home e End andam;
 * Esc fecha e devolve o foco ao botao; Tab sai e fecha. Fechado, os itens nao recebem foco.
 */
export function Menu({ open, onClose, label, style, children, onMouseLeave }: { open: boolean; onClose: () => void; label: string; style?: CSSProperties; children: ReactNode; onMouseLeave?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const t = setTimeout(() => items()[0]?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); trigger?.focus(); return; }
      if (e.key === 'Tab') { close.current(); return; }
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const to = e.key === 'ArrowDown' ? (at + 1) % list.length : e.key === 'ArrowUp' ? (at <= 0 ? list.length - 1 : at - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
      if (to === null || !list.length) return;
      e.preventDefault();
      list[to]!.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className={'menu' + (open ? ' open' : '')} role="menu" aria-label={label} style={style} inert={!open} onMouseLeave={onMouseLeave}>
      {children}
    </div>
  );
}

/* ---------- Copiar ---------- */
/** Copia o texto e so diz que copiou se copiou mesmo (o navegador pode negar o acesso). */
export function useCopy() {
  const toast = useToast();
  return useCallback(async (text: string, done: string) => {
    try {
      if (!navigator.clipboard) throw new Error('sem área de transferência');
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Não foi possível copiar. Selecione o texto e copie à mão.', 'ti-alert-triangle');
    }
  }, [toast]);
}
