import { useQuery } from '@tanstack/react-query';
import type { AdminClientSummaryDTO, AdminUserDTO } from '@nay/shared';
import { api } from '../lib/api';

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<AdminUserDTO[]>('/api/admin/users') });
}

export function useAdminSummary(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api<AdminClientSummaryDTO[]>('/api/admin/summary'), enabled });
}
