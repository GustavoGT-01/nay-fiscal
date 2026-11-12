import type { CnpjLookupDTO } from '@nay/shared';

/** Consulta publica de CNPJ (BrasilAPI). So o CNPJ sai do sistema. */
export async function lookupCnpj(cnpj: string): Promise<CnpjLookupDTO | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'nay-fiscal' } });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error('A consulta de CNPJ está fora do ar. Preencha os dados à mão.'), { statusCode: 502 });
  const d = (await r.json()) as Record<string, unknown>;
  const simples = typeof d.opcao_pelo_simples === 'boolean' ? (d.opcao_pelo_simples as boolean) : null;
  const mei = d.opcao_pelo_mei === true;
  const cnae = d.cnae_fiscal ? String(d.cnae_fiscal).replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3') : null;
  return {
    cnpj,
    name: String(d.razao_social ?? ''),
    tradeName: (d.nome_fantasia as string) || null,
    city: (d.municipio as string) || null,
    cityCode: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : null,
    uf: (d.uf as string) || null,
    cnae,
    simplesOptante: simples,
    regime: mei ? 'MEI' : simples ? 'SIMPLES_NACIONAL' : 'A_DEFINIR',
    situacao: (d.descricao_situacao_cadastral as string) || null,
  };
}