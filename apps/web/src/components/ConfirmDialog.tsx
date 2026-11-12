import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  text: ReactNode;
  /** Palavra que a pessoa precisa digitar para liberar o botao (ex.: APAGAR). */
  typeToConfirm?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmacao de acao destrutiva. Esc fecha, foco fica preso no dialogo e volta ao gatilho. */
export function ConfirmDialog({ open, title, text, typeToConfirm, confirmLabel = 'Apagar', busy, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const cancelCb = useRef(onCancel);
  cancelCb.current = onCancel;
  const ready = !busy && (!typeToConfirm || typed.trim() === typeToConfirm);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    const back = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (inputRef.current ?? cancelRef.current)?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); cancelCb.current(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const els = [...boxRef.current.querySelectorAll<HTMLElement>('input,button:not([disabled])')];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // captura: o Esc fecha so o dialogo, nao o drawer que esta por baixo
    window.addEventListener('keydown', onKey, true);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true); back?.focus?.(); };
  }, [open]);

  // portal: fica acima do drawer (que cria seu proprio contexto de empilhamento)
  return createPortal(
    <>
      <div className={'scrim2' + (open ? ' on' : '')} onClick={busy ? undefined : onCancel} />
      <div
        ref={boxRef}
        className={'cmdk confirm' + (open ? ' on' : '')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        aria-hidden={!open}
      >
        {open && (
          <form onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(); }}>
            <div className="confirm-b">
              <span className="confirm-ico"><i className="ti ti-alert-triangle" /></span>
              <div>
                <h2 id={titleId}>{title}</h2>
                <div id={textId} className="hint">{text}</div>
              </div>
            </div>
            {typeToConfirm && (
              <label className="confirm-type">
                <span>Digite <b className="mono">{typeToConfirm}</b> para confirmar</span>
                <span className="input">
                  <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`Digite ${typeToConfirm} para confirmar`} />
                </span>
              </label>
            )}
            <div className="confirm-f">
              <button type="button" className="btn" ref={cancelRef} onClick={onCancel} disabled={busy}>Cancelar</button>
              <button type="submit" className="btn danger" disabled={!ready}>
                <i className="ti ti-trash" />{busy ? 'Apagando…' : confirmLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </>,
    document.body,
  );
}
