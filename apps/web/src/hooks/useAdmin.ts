import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminClientSummaryDTO, AdminProfileDTO, AdminUserDTO } from '@nay/shared';
import { api } from '../lib/api';

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<AdminUserDTO[]>('/api/admin/users') });
}

export function useAdminProfiles() {
  return useQuery({ queryKey: ['admin', 'profiles'], queryFn: () => api<AdminProfileDTO[]>('/api/admin/profiles') });
}

export function useAdminSummary(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api<AdminClientSummaryDTO[]>('/api/admin/summary'), enabled });
}

export interface UserForm { name: string; email: string; password: string; role: 'ADMIN' | 'ANALISTA'; profileId: string | null }
export interface UserPatch { name?: string; role?: 'ADMIN' | 'ANALISTA'; profileId?: string | null; active?: boolean; password?: string }
export interface ProfileForm { name: string; permissions: string[] }

const json = (v: unknown) => JSON.stringify(v);

/** Escrita de usuarios e perfis: depois de cada uma, as listas e a sessao (permissoes do proprio usuario) sao relidas. */
export function useTeamActions() {
  const qc = useQueryClient();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
  return {
    createUser: useMutation({ mutationFn: (b: UserForm) => api<AdminUserDTO>('/api/admin/users', { method: 'POST', body: json(b) }), onSuccess: done }),
    updateUser: useMutation({ mutationFn: ({ id, ...b }: UserPatch & { id: string }) => api<AdminUserDTO>(`/api/admin/users/${id}`, { method: 'PATCH', body: json(b) }), onSuccess: done }),
    createProfile: useMutation({ mutationFn: (b: ProfileForm) => api<AdminProfileDTO>('/api/admin/profiles', { method: 'POST', body: json(b) }), onSuccess: done }),
    updateProfile: useMutation({ mutationFn: ({ id, ...b }: ProfileForm & { id: string }) => api<AdminProfileDTO>(`/api/admin/profiles/${id}`, { method: 'PUT', body: json(b) }), onSuccess: done }),
    deleteProfile: useMutation({ mutationFn: (id: string) => api<{ ok: true }>(`/api/admin/profiles/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}
