import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { NoteDrawer } from './Drawer';

const Ctx = createContext<(id: string) => void>(() => {});
export const useOpenNote = () => useContext(Ctx);

/** Parametro da URL que guarda a nota aberta: da para copiar o link e o botao Voltar fecha a gaveta. */
export const NOTE_PARAM = 'nota';

export function NoteDrawerProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const id = params.get(NOTE_PARAM) || null;

  const open = useCallback((noteId: string) => {
    const next = new URLSearchParams(params);
    next.set(NOTE_PARAM, noteId);
    // `drawer` marca que fomos nos que abrimos: ai o Voltar do navegador e o fechar fazem o mesmo
    nav({ pathname: loc.pathname, search: next.toString() }, { state: { drawer: true } });
  }, [params, loc.pathname, nav]);

  const close = useCallback(() => {
    if ((loc.state as { drawer?: boolean } | null)?.drawer) return nav(-1);
    const next = new URLSearchParams(params);
    next.delete(NOTE_PARAM);
    setParams(next, { replace: true });
  }, [params, loc.state, nav, setParams]);

  return (
    <Ctx.Provider value={open}>
      {children}
      <NoteDrawer id={id} onClose={close} />
    </Ctx.Provider>
  );
}
