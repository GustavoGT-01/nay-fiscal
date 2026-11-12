import { useSyncExternalStore } from 'react';
import type { DirectionFilter } from '@nay/shared';
import { Seg } from './ui';

/** Escolha Entradas | Saidas | Todas, compartilhada entre Inicio, Notas e Auditoria e lembrada no navegador. */
const KEY = 'nay.direction';
const listeners = new Set<() => void>();

function read(): DirectionFilter {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'entrada' || v === 'saida' || v === 'all' ? v : 'all';
  } catch {
    return 'all';
  }
}

let current: DirectionFilter = read();

function setDirection(v: DirectionFilter) {
  current = v;
  try { localStorage.setItem(KEY, v); } catch { /* armazenamento indisponivel */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useDirection(): [DirectionFilter, (v: DirectionFilter) => void] {
  const v = useSyncExternalStore(subscribe, () => current);
  return [v, setDirection];
}

export function DirectionSeg({ value, onChange }: { value: DirectionFilter; onChange: (v: DirectionFilter) => void }) {
  return (
    <Seg<DirectionFilter>
      label="Direção das notas"
      value={value}
      onChange={onChange}
      options={[{ value: 'entrada', label: 'Entradas' }, { value: 'saida', label: 'Saídas' }, { value: 'all', label: 'Todas' }]}
    />
  );
}
