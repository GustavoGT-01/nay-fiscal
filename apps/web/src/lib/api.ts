/** Cliente HTTP da API com renovacao automatica do token. */

const KEY = 'nay.tokens';

interface Tokens { accessToken: string; refreshToken: string }

export const tokens = {
  get(): Tokens | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  },
  set(t: Tokens | null) {
    try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch { /* armazenamento indisponivel */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = tokens.get();
  if (!t) return false;
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) { tokens.set(null); return false; }
      tokens.set(await r.json());
      return true;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export const onUnauthorized = { cb: () => {} };

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const t = tokens.get();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t.accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && retry && t && !path.startsWith('/api/auth/')) {
    if (await refresh()) return api<T>(path, init, false);
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
