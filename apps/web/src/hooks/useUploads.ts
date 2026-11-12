import { useQuery } from '@tanstack/react-query';
import type { UploadDTO } from '@nay/shared';
import { api } from '../lib/api';

/** Envios de XML/ZIP/SPED; reconsulta enquanto algum estiver processando. */
export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: () => api<UploadDTO[]>('/api/uploads'),
    refetchInterval: (q) => (q.state.data?.some((u) => u.status === 'PROCESSANDO') ? 700 : false),
  });
}
