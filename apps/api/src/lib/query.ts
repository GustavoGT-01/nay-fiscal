import { z } from 'zod';

/**
 * Esquemas dos parametros de URL (query e params), um so lugar para todos os controllers.
 * Valor fora do esperado vira 400 (ZodError no tratador de erros do app), nunca 500 nem filtro ignorado em silencio.
 * Datas seguem AAAA-MM-DD aqui; a conversao para intervalo (fuso -03:00) e a checagem de dia real ficam em services/filters.ts.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use AAAA-MM-DD.').or(z.literal(''));

export const Direction = z.enum(['entrada', 'saida', 'all']);

/** Cliente + periodo + direcao: painel, auditoria, NFS-e e exportacao. `clientId` ausente e tratado por ownClient ("Escolha um cliente."). */
export const ScopeQuery = z.object({
  clientId: z.string().max(100).optional(),
  from: day.optional(),
  to: day.optional(),
  direction: Direction.optional(),
});

export const ExportQuery = ScopeQuery.extend({ format: z.enum(['xlsx', 'csv']).default('xlsx') });

/** Situacao da nota na lista; "problemas" = erro + atencao. */
const NOTE_STATUS = ['all', 'problemas', 'ok', 'erro', 'atencao', 'cancelada', 'pendente'] as const;
const VERDICTS = ['pode_creditar', 'credito_em_risco', 'nao_creditar', 'correta', 'corrigir', 'cancelar_reemitir', 'cancelada'] as const;

export const ListNotesQuery = ScopeQuery.extend({
  clientId: z.string().max(100), // aqui e obrigatorio
  status: z.enum(NOTE_STATUS).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(0).max(100_000).default(0),
  size: z.coerce.number().int().min(1).max(100).default(12),
  supplier: z.string().max(20).optional(),
  verdict: z.enum(VERDICTS).optional(),
  model: z.enum(['55', '65', '57', 'NFSE']).optional(), // NFSE = so notas de servico
});

export const IdParam = z.object({ id: z.string().min(1).max(100) });
