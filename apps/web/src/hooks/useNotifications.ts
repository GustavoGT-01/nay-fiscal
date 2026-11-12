import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type NotificationItem = { id: string; title: string; message: string; readAt: string | null };

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => api<NotificationItem[]>('/api/notifications') });
}
