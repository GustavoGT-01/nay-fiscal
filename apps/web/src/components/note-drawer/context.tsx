import { createContext, useContext, useState, type ReactNode } from 'react';
import { NoteDrawer } from './Drawer';

const Ctx = createContext<(id: string) => void>(() => {});
export const useOpenNote = () => useContext(Ctx);

export function NoteDrawerProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={setId}>
      {children}
      <NoteDrawer id={id} onClose={() => setId(null)} />
    </Ctx.Provider>
  );
}
