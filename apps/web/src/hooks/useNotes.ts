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
}

/** Lista paginada da tela Notas. */
export function useNotes(clientId: string | undefined, f: NotesFilters) {
  return useQuery({
    queryKey: ['notes', clientId, f.status, f.text, f.page, f.supplier, f.direction, f.verdict],
    queryFn: () =>
      api<{ total: number; rows: NoteRowDTO[] }>(
        `/api/notes?clientId=${clientId}&status=${f.status === 'ok' ? 'ok' : f.status}&q=${encodeURIComponent(f.text)}&page=${f.page}&size=${NOTES_PER_PAGE}${f.supplier ? '&supplier=' + f.supplier : ''}&direction=${f.direction}${f.verdict ? '&verdict=' + f.verdict : ''}`,
      ),
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
