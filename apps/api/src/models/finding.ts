import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';

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

export const listForRuleGroups = (where: Prisma.FindingWhereInput) =>
  prisma.finding.findMany({
    where,
    select: { ruleCode: true, severity: true, documentId: true, document: { select: { number: true } } },
  });

export const listForExport = (where: Prisma.FindingWhereInput) =>
  // sem a coluna xml (pesada) e com teto de linhas: exportar nao pode derrubar a API
  prisma.finding.findMany({ where, include: { document: { omit: { xml: true } }, item: true }, orderBy: [{ document: { issuedAt: 'desc' } }], take: EXPORT_MAX_ROWS });

export const EXPORT_MAX_ROWS = 50_000;

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