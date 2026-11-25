import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, download, tokens } from '../src/lib/api';

// fetch simulado: cada chamada tira a proxima resposta da fila
type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; blob?: string };
let fila: Reply[] = [];
let chamadas: { url: string; auth: string | null }[] = [];

const resposta = (r: Reply) => {
  const status = r.status ?? 200;
  if (r.blob !== undefined) return new Response(r.blob, { status, headers: { 'content-type': 'text/csv', ...r.headers } });
  return new Response(JSON.stringify(r.body ?? {}), { status, headers: { 'content-type': 'application/json', ...r.headers } });
};

beforeEach(() => {
  fila = [];
  chamadas = [];
  tokens.set(null);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    chamadas.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    const r = fila.shift();
    if (!r) throw new Error('fetch sem resposta preparada: ' + url);
    return resposta(r);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('api()', () => {
  it('manda o token de acesso e devolve o JSON', async () => {
    tokens.set('abc');
    fila = [{ body: { ok: 1 } }];
    expect(await api('/api/x')).toEqual({ ok: 1 });
    expect(chamadas[0]?.auth).toBe('Bearer abc');
  });

  it('erro do servidor vira ApiError com a mensagem dele; sem mensagem, usa a padrão em português', async () => {
    fila = [{ status: 400, body: { message: 'Data inválida.' } }, { status: 500, body: {} }];
    await expect(api('/api/x')).rejects.toMatchObject({ status: 400, message: 'Data inválida.' });
    const e = (await api('/api/y').catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toContain('Tente de novo');
  });

  it('401: renova a sessão uma vez e repete a chamada com o token novo', async () => {
    tokens.set('velho');
    fila = [{ status: 401, body: {} }, { body: { accessToken: 'novo', user: {} } }, { body: { dados: 7 } }];
    expect(await api('/api/x')).toEqual({ dados: 7 });
    expect(chamadas.map((c) => c.url)).toEqual(['/api/x', '/api/auth/refresh', '/api/x']);
    expect(chamadas[2]?.auth).toBe('Bearer novo');
  });

  it('401 e a renovação falha: avisa que a sessão acabou em vez de repetir sem fim', async () => {
    const acabou = vi.fn();
    const { onUnauthorized } = await import('../src/lib/api');
    onUnauthorized.cb = acabou;
    fila = [{ status: 401, body: {} }, { status: 401, body: {} }];
    await expect(api('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(acabou).toHaveBeenCalledOnce();
    expect(chamadas).toHaveLength(2); // a chamada e uma tentativa de renovar, nada mais
  });
});

describe('download()', () => {
  // o clique no link de download e simulado: jsdom nao baixa arquivos
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('arquivo completo: não informa corte', async () => {
    fila = [{ blob: 'a;b' }];
    expect(await download('/api/audit/export?clientId=1', 'a.csv')).toEqual({ truncatedAt: null });
  });

  it('arquivo cortado pelo servidor: devolve o limite de linhas do cabeçalho', async () => {
    fila = [{ blob: 'a;b', headers: { 'x-export-truncated': '50000' } }];
    expect(await download('/api/audit/export?clientId=1', 'a.csv')).toEqual({ truncatedAt: 50000 });
  });

  it('cabeçalho inválido não vira aviso', async () => {
    fila = [{ blob: 'a;b', headers: { 'x-export-truncated': 'abc' } }];
    expect(await download('/api/audit/export?clientId=1', 'a.csv')).toEqual({ truncatedAt: null });
  });

  it('falha do servidor propaga como ApiError, sem baixar nada', async () => {
    fila = [{ status: 403, body: { message: 'Sem acesso.' } }];
    await expect(download('/api/audit/export?clientId=1', 'a.csv')).rejects.toMatchObject({ status: 403 });
  });
});
