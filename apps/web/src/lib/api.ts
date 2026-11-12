/**
 * Cliente HTTP da API com renovacao automatica do token.
 *
 * Seguranca: o token de acesso (15 min) fica so na memoria da aba; o refresh token fica num
 * cookie httpOnly que o JavaScript nao consegue ler: um XSS nao leva o token embora (mas ainda
 * agiria como o usuario enquanto a pagina estiver aberta; a defesa principal e a CSP).
 */

let accessToken: string | null = null;

export const tokens = {
  get: () => accessToken,
  set(t: string | null) {
    accessToken = t;
  },
};

// versoes antigas guardavam os tokens no localStorage: apaga o que tiver sobrado
try { localStorage.removeItem('nay.tokens'); } catch { /* armazenamento indisponivel */ }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let refreshing: Promise<unknown | null> | null = null;

/** Pede um token novo usando o cookie de sessao. Devolve o corpo ({ accessToken, user }) ou null. */
export function refreshSession<T = unknown>(): Promise<T | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => {
      if (!r.ok) { tokens.set(null); return null; }
      const body = await r.json();
      tokens.set(body.accessToken);
      return body;
    })
    .catch(() => null)
    .finally(() => { refreshing = null; });
  return refreshing as Promise<T | null>;
}

export const onUnauthorized = { cb: () => {} };

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const t = tokens.get();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && retry && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) return api<T>(path, init, false);
    onUnauthorized.cb();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? 'Não foi possível concluir. Tente de novo.');
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

/** Baixa um arquivo autenticado. */
export async function download(path: string, filename: string) {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
export const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR');
export const fmtCnpj = (c: string) =>
  c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
export const initials = (s: string) => s.split(' ').filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
