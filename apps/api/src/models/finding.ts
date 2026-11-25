import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { fromDb } from '../lib/money.js';

/** Regras com mais itens com erro (painel Inicio). */
export const errorItemsByRule = (where: Prisma.FindingWhereInput) =>
  prisma.finding.groupBy({ by: ['ruleCode'], _count: true, where, orderBy: { _count: { ruleCode: 'desc' } } });

/** Achados (erro/atencao) agrupados por regra e severidade para o diagnostico. */
export const countByRuleAndSeverity = (clientId: string) =>
  prisma.finding.groupBy({
    by: ['ruleCode', 'severity'], _count: true,
    where: { severity: { in: ['erro', 'atencao'] }, document: { clientId, status: { not: 'cancelada' } } },
    orderBy: { _count: { ruleCode: 'desc' } },
  });

/**
 * Achados contados no banco por regra, severidade e nota: uma linha por combinacao, com a quantidade de achados
 * (itens). Nao carrega o achado nem a nota; a tela soma `items` por regra e conta as notas distintas.
 */
export const countByRuleSeverityDocument = (where: Prisma.FindingWhereInput) =>
  prisma.finding.groupBy({ by: ['ruleCode', 'severity', 'documentId'], _count: true, where });

export const EXPORT_MAX_ROWS = 50_000;

/**
 * Achados para o relatorio, sem a coluna xml (pesada) e com teto de linhas: exportar nao pode derrubar a API.
 * Busca uma linha a mais so para saber se o teto cortou o relatorio, e devolve `truncated` com no maximo o teto.
 */
export async function listForExport(where: Prisma.FindingWhereInput, max = EXPORT_MAX_ROWS) {
  const rows = await prisma.finding.findMany({
    where, include: { document: { omit: { xml: true } }, item: true }, orderBy: [{ document: { issuedAt: 'desc' } }], take: max + 1,
  });
  const truncated = rows.length > max;
  return { rows: fromDb(truncated ? rows.slice(0, max) : rows), truncated };
}

type NewFinding = {
  documentId: string; itemId: string | null; ruleCode: string; field: string; kind: string;
  severity: string; observed: string; expected: string;
};

/** Troca os achados da nota e grava o resultado da auditoria na propria nota, numa transacao. */
export const replaceAudit = (docId: string, findings: NewFinding[], result: { status: string; verdict: string }) =>
  prisma.$transaction([
    prisma.finding.deleteMany({ where: { documentId: docId } }),
    prisma.finding.createMany({ data: findings }),
    prisma.document.update({ where: { id: docId }, data: { ...result, auditedAt: new Date() } }),
  ]);