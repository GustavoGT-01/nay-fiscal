import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CreditsDTO } from '@nay/shared';
import { api } from '../lib/api';

/** Creditos de IBS/CBS das notas de entrada, por fornecedor ou por mes. */
export function useCredits(clientId: string | undefined, group: 'forn' | 'mes', from: string, to: string) {
  const qs = `clientId=${clientId}&group=${group}${from ? `&from=${from}&to=${to}` : ''}`;
  return useQuery({
    queryKey: ['credits', qs],
    queryFn: () => api<CreditsDTO>(`/api/credits?${qs}`),
    enabled: !!clientId,
    placeholderData: keepPreviousData,
  });
}
