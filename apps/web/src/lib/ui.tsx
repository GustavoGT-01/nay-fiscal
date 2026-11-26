import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from './api';

/* ---------- Toasts ---------- */
interface ToastItem { id: number; msg: string; icon: string; out?: boolean }
const ToastCtx = createContext<(msg: string, icon?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((msg: string, icon = 'ti-circle-check') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, icon }]);
    setTimeout(() => setItems((x) => x.map((t) => (t.id === id ? { ...t, out: true } : t))), 2800);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3100);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast' + (t.out ? ' out' : '')}>
            <i className={'ti ' + t.icon} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Segmentado com thumb deslizante ---------- */
export function Seg<T extends string>({
  options, value, onChange, style, label,
}: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; style?: React.CSSProperties; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 4, width: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const on = ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (on) setThumb({ left: on.offsetLeft, width: on.offsetWidth });
    };
    place();
    // reposiciona quando o tamanho dos botoes muda (fontes carregando, quebra de linha, celular)
    const ro = new ResizeObserver(place);
    ref.current?.querySelectorAll('button').forEach((b) => ro.observe(b));
    document.fonts?.ready.then(place).catch(() => {});
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div className="seg" ref={ref} style={style} role="group" aria-label={label}>
      <span className="thumb" style={{ left: thumb.left, width: thumb.width }} />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Anel de progresso ---------- */
export function Ring({ pct, color, size }: { pct: number; color: string; size?: number }) {
  return (
    <svg className="ring" viewBox="0 0 60 60" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <circle className="bg" cx="30" cy="30" r="25" />
      <circle className="fg" cx="30" cy="30" r="25" strokeDasharray="157" strokeDashoffset={157 - (157 * pct) / 100} style={{ stroke: color }} />
    </svg>
  );
}

export const ringColor = (p: number) => (p > 85 ? 'var(--limao)' : p > 70 ? 'var(--maracuja)' : 'var(--caju)');

/* ---------- Tags de situacao ---------- */
export function StatusTag({ status }: { status: string }) {
  if (status === 'erro') return <span className="tag erro"><i className="ti ti-alert-triangle" />Com erro</span>;
  if (status === 'cancelada') return <span className="tag neutro">Cancelada</span>;
  if (status === 'atencao') return <span className="tag atencao">Atenção</span>;
  if (status === 'pendente') return <span className="tag neutro">Pendente</span>;
  return <span className="tag ok"><i className="ti ti-check" />Conforme</span>;
}

export const SEV_LABEL: Record<string, string> = { erro: 'Erro', atencao: 'Atenção', a_verificar: 'A verificar', ok: 'OK' };
export const sevClass = (s: string) => (s === 'a_verificar' ? 'neutro' : s);

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico"><i className={'ti ' + icon} /></div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

/**
 * Falha ao carregar uma consulta: diz o que nao carregou e deixa tentar de novo.
 * Sem isso a tela fica num carregamento eterno, ou mostra "vazio" como se nao houvesse dados.
 */
export function QueryError({ error, onRetry, what = 'os dados' }: { error: unknown; onRetry: () => void; what?: string }) {
  // so mostra a mensagem do servidor (ja em portugues); erro de rede chega em ingles e vira texto fixo
  const detail = error instanceof ApiError && error.message ? error.message : 'Verifique a conexão e tente de novo.';
  return (
    <div className="err-box row" role="alert">
      <span><b>Não foi possível carregar {what}.</b> {detail}</span>
      <button type="button" className="btn" onClick={onRetry}><i className="ti ti-refresh" />Tentar de novo</button>
    </div>
  );
}
