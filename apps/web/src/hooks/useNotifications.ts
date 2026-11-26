import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type NotificationItem = { id: string; type: string; title: string; message: string; severity: string; createdAt: string; readAt: string | null };

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => api<NotificationItem[]>('/api/notifications') });
}

/** Marca avisos como lidos para o usuario (sem `ids`, todos) e atualiza a lista (o ponto do sino some). */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api<{ marked: number }>('/api/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
