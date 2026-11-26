import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NoteDetailDTO, NoteRowDTO } from '@nay/shared';
import { api } from '../lib/api';

export const NOTES_PER_PAGE = 12;

export interface NotesFilters {
  status: string;
  text: string;
  page: number;
  supplier: string;
  direction: string;
  verdict: string;
  /** AAAA-MM-DD, vazio = sem limite */
  from?: string;
  to?: string;
  cfop?: string;
  /** '' = todos os modelos */
  model?: string;
  sort?: SortKey;
  order?: 'asc' | 'desc';
}

export type SortKey = 'issuedAt' | 'total' | 'status' | 'emitterName';

/** Lista paginada da tela Notas. */
export function useNotes(clientId: string | undefined, f: NotesFilters) {
  const p = new URLSearchParams({ clientId: clientId ?? '', status: f.status, q: f.text, page: String(f.page), size: String(NOTES_PER_PAGE), direction: f.direction });
  if (f.supplier) p.set('supplier', f.supplier);
  if (f.verdict) p.set('verdict', f.verdict);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.cfop) p.set('cfop', f.cfop);
  if (f.model) p.set('model', f.model);
  if (f.sort) p.set('sort', f.sort);
  if (f.order) p.set('order', f.order);
  const qs = p.toString();
  return useQuery({
    queryKey: ['notes', clientId, qs],
    queryFn: () => api<{ total: number; rows: NoteRowDTO[] }>(`/api/notes?${qs}`),
    enabled: !!clientId,
    placeholderData: keepPreviousData,
  });
}

/** Busca rápida da paleta de comandos. */
export function useNoteSearch(clientId: string | undefined, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['cmd-notes', clientId, q],
    queryFn: () => api<{ rows: NoteRowDTO[] }>(`/api/notes?clientId=${clientId}&q=${encodeURIComponent(q)}&size=6`),
    enabled,
  });
}

/** Diagnóstico completo de uma nota (gaveta). */
export function useNote(id: string | null) {
  return useQuery({ queryKey: ['note', id], queryFn: () => api<NoteDetailDTO>(`/api/notes/${id}`), enabled: !!id });
}
