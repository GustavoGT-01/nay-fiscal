import type { QueryClient } from '@tanstack/react-query';

/** Depois de uma mudanca grande (apagar, auditar, cadastrar), rele todas as consultas menos a da sessao. */
export const refreshData = (qc: QueryClient) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
