/**
 * JSON.parse que nao derruba a requisicao: texto gravado no banco (permissoes, regras, dados da NFS-e)
 * pode estar corrompido. Devolve `fallback` quando nao da para ler.
 */
export function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
