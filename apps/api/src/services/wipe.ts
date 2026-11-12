import type { PrismaClient } from '@prisma/client';

export interface WipeCounts {
  documents: number;
  items: number;
  findings: number;
  uploads: number;
  auditRuns: number;
}

/**
 * Apaga notas (itens e achados), envios e rodadas de auditoria dos clientes informados.
 * `clientIds` undefined = todos os clientes do banco. Nunca toca em usuarios, perfis,
 * clientes, estabelecimentos ou regras.
 */
export async function wipeClientData(db: PrismaClient, clientIds?: string[]): Promise<WipeCounts> {
  const byClient = clientIds ? { clientId: { in: clientIds } } : {};
  const byDoc = clientIds ? { document: { clientId: { in: clientIds } } } : {};
  return db.$transaction(async (tx) => {
    const findings = (await tx.finding.deleteMany({ where: byDoc })).count;
    const items = (await tx.documentItem.deleteMany({ where: byDoc })).count;
    const documents = (await tx.document.deleteMany({ where: byClient })).count;
    const uploads = (await tx.upload.deleteMany({ where: byClient })).count;
    const auditRuns = (await tx.auditRun.deleteMany({ where: byClient })).count;
    return { documents, items, findings, uploads, auditRuns };
  }, { timeout: 120_000 });
}
