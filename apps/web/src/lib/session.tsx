import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientDTO, UserDTO } from '@nay/shared';
import { api, ApiError, onUnauthorized, tokens } from './api';

interface Session {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clients: ClientDTO[];
  client: ClientDTO | null;
  setClientId: (id: string) => void;
  can: (perm: string) => boolean;
}

const Ctx = createContext<Session>(null!);
export const useSession = () => useContext(Ctx);

const CLIENT_KEY = 'nay.client';

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState(!!tokens.get());
  const [clientId, setClientIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(CLIENT_KEY); } catch { return null; }
  });

  // falha de rede (ex.: API reiniciando) tenta de novo; so 401 encerra a sessao
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<UserDTO>('/api/me'),
    enabled: hasToken,
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 5,
    retryDelay: 800,
  });
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<ClientDTO[]>('/api/clients'), enabled: !!me.data });

  const logout = useCallback(() => {
    tokens.set(null);
    setHasToken(false);
    qc.clear();
  }, [qc]);

  useEffect(() => { onUnauthorized.cb = logout; }, [logout]);

  const login = async (email: string, password: string) => {
    const r = await api<{ accessToken: string; refreshToken: string; user: UserDTO }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    qc.setQueryData(['me'], r.user);
    setHasToken(true);
  };

  const list = clients.data ?? [];
  const client = list.find((c) => c.id === clientId) ?? list.find((c) => c.name.startsWith('Empresa')) ?? list[0] ?? null;
  const setClientId = (id: string) => {
    setClientIdState(id);
    try { localStorage.setItem(CLIENT_KEY, id); } catch { /* ignora */ }
  };

  const user = hasToken ? me.data ?? null : null;
  return (
    <Ctx.Provider
      value={{
        user,
        loading: hasToken && (me.isPending || (!!me.data && clients.isLoading)),
        login,
        logout,
        clients: list,
        client,
        setClientId,
        can: (p) => !!user?.permissions.includes(p),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
