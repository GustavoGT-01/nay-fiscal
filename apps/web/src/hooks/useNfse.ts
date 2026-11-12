import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NfseSummaryDTO, NoteRowDTO } from '@nay/shared';
import { api } from '../lib/api';

export const NFSE_PER_PAGE = 12;

export function useNfse(clientId: string | undefined, dir: string, page: number) {
  const qs = `clientId=${clientId}&direction=${dir}`;
  const sum = useQuery({ queryKey: ['nfse-sum', qs], queryFn: () => api<NfseSummaryDTO>(`/api/nfse/summary?${qs}`), enabled: !!clientId });
  const list = useQuery({
    queryKey: ['nfse-list', qs, page],
    queryFn: () => api<{ total: number; rows: NoteRowDTO[] }>(`/api/notes?${qs}&model=NFSE&page=${page}&size=${NFSE_PER_PAGE}`),
    enabled: !!clientId,
    placeholderData: keepPreviousData,
  });
  return { sum, list };
}
