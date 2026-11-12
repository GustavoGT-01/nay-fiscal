import { useQuery } from '@tanstack/react-query';
import type { DashboardDTO } from '@nay/shared';
import { api } from '../lib/api';

/** Painel do cliente. Sem `direction` busca o painel geral (Shell, IA); com ele, o painel filtrado (Início). */
export function useDashboard(clientId: string | undefined, opts: { direction?: string; enabled?: boolean } = {}) {
  const { direction, enabled = true } = opts;
  return useQuery({
    queryKey: direction === undefined ? ['dashboard', clientId] : ['dashboard', clientId, direction],
    queryFn: () => api<DashboardDTO>(`/api/dashboard?clientId=${clientId}${direction === undefined ? '' : `&direction=${direction}`}`),
    enabled: !!clientId && enabled,
  });
}
