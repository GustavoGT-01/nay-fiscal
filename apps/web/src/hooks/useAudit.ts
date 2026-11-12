import { useQuery } from '@tanstack/react-query';
import type { NoteRowDTO, RuleGroupDTO, SupplierGroupDTO } from '@nay/shared';
import { api } from '../lib/api';

export type AuditMode = 'regra' | 'nota' | 'forn';

/** As três visões da Auditoria; só a do modo ativo consulta a API. */
export function useAudit(clientId: string | undefined, qs: string, mode: AuditMode) {
  const rules = useQuery({ queryKey: ['audit-rules', qs], queryFn: () => api<RuleGroupDTO[]>(`/api/audit/rules?${qs}`), enabled: !!clientId && mode === 'regra' });
  const notes = useQuery({ queryKey: ['audit-notes', qs], queryFn: () => api<{ rows: NoteRowDTO[] }>(`/api/notes?${qs}&status=problemas&size=30`), enabled: !!clientId && mode === 'nota' });
  const sups = useQuery({ queryKey: ['audit-sup', qs], queryFn: () => api<SupplierGroupDTO[]>(`/api/audit/suppliers?${qs}`), enabled: !!clientId && mode === 'forn' });
  return { rules, notes, sups };
}
