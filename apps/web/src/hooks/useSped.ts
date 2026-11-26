import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SpedDetailDTO, SpedFileDTO, SpedKind } from '@nay/shared';
import { api } from '../lib/api';

export const SPED_PER_PAGE = 50;

/** Arquivos de SPED do cliente, do mais recente para o mais antigo. */
export function useSpedFiles(clientId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: ['sped', clientId], queryFn: () => api<SpedFileDTO[]>(`/api/sped?clientId=${clientId}`), enabled: !!clientId && enabled });
}

/** Um arquivo: contagem por tipo e uma pagina das divergencias. */
export function useSpedDetail(id: string | undefined, kind: SpedKind | '', page: number) {
  const qs = `page=${page}&size=${SPED_PER_PAGE}${kind ? '&kind=' + kind : ''}`;
  return useQuery({
    queryKey: ['sped-file', id, qs],
    queryFn: () => api<SpedDetailDTO>(`/api/sped/${id}?${qs}`),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}
