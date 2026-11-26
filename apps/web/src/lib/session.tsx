import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientDTO, UserDTO } from '@nay/shared';
import { api, ApiError, onUnauthorized, refreshSession, tokens } from './api';

interface Session {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  logoutAll: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
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
  // ao abrir a pagina, a sessao volta pelo cookie httpOnly (o token de acesso so vive na memoria)
  const [booting, setBooting] = useState(!tokens.get());
  useEffect(() => {
    if (!booting) return;
    refreshSession<{ accessToken: string; user: UserDTO }>()
      .then((r) => {
        if (r) { qc.setQueryData(['me'], r.user); setHasToken(true); }
      })
      .finally(() => setBooting(false));
  }, []);
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
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => api<ClientDTO[]>('/api/clients'), enabled: !!me.data && !me.data.mustChangePassword });

  const logout = useCallback(() => {
    // apaga o cookie de sessao no servidor; a tela sai mesmo se a rede falhar
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    tokens.set(null);
    setHasToken(false);
    qc.clear();
  }, [qc]);

  useEffect(() => { onUnauthorized.cb = logout; }, [logout]);

  /** Encerra a sessao em todos os aparelhos, inclusive este. Se o servidor nao confirmar, a pessoa continua dentro. */
  const logoutAll = async () => {
    await api<{ ok: true }>('/api/auth/logout-all', { method: 'POST' });
    logout();
  };

  const login = async (email: string, password: string) => {
    const r = await api<{ accessToken: string; user: UserDTO }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    tokens.set(r.accessToken);
    qc.setQueryData(['me'], r.user);
    setHasToken(true);
  };

  /** Troca a propria senha: o servidor encerra as outras sessoes e devolve uma nova para esta. */
  const changePassword = async (current: string, next: string) => {
    const r = await api<{ accessToken: string; user: UserDTO }>('/api/auth/change-password', {
      method: 'POST', body: JSON.stringify({ current, next }),
    });
    tokens.set(r.accessToken);
    qc.setQueryData(['me'], r.user);
  };

  const list = clients.data ?? [];
  const client = list.find((c) => c.id === clientId) ?? list[0] ?? null;
  const setClientId = (id: string) => {
    setClientIdState(id);
    try { localStorage.setItem(CLIENT_KEY, id); } catch { /* ignora */ }
  };

  const user = hasToken ? me.data ?? null : null;
  return (
    <Ctx.Provider
      value={{
        user,
        loading: booting || (hasToken && (me.isPending || (!!me.data && clients.isLoading))),
        login,
        logout,
        logoutAll,
        changePassword,
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
