import { prisma } from '../config/db.js';

export const create = (data: { officeId: string; type: string; title: string; message: string; severity: string }) =>
  prisma.notification.create({ data });

/**
 * Avisos do escritorio visiveis ao usuario (gerais ou dele), sem os tipos que o perfil nao alcanca.
 * `readAt` e o do usuario: o aviso geral e lido por pessoa.
 */
export async function listFor(officeId: string, userId: string, hidden: string[] = []) {
  const rows = await prisma.notification.findMany({
    where: { officeId, OR: [{ userId: null }, { userId }], type: { notIn: hidden } },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { reads: { where: { userId }, select: { readAt: true } } },
  });
  return rows.map(({ reads, ...n }) => ({ ...n, readAt: reads[0]?.readAt ?? null }));
}

/**
 * Marca como lidos, para o usuario, avisos que ele pode ver. Sem `ids`, marca todos os visiveis.
 * Ids de outro escritorio ou de outro usuario sao ignorados (nao ha erro nem vazamento).
 */
export async function markRead(officeId: string, userId: string, ids?: string[], hidden: string[] = []) {
  const visible = await prisma.notification.findMany({
    where: { officeId, OR: [{ userId: null }, { userId }], type: { notIn: hidden }, ...(ids ? { id: { in: ids } } : {}), reads: { none: { userId } } },
    select: { id: true },
    take: 200,
  });
  const readAt = new Date();
  await prisma.$transaction(
    visible.map((n) =>
      prisma.notificationRead.upsert({ where: { notificationId_userId: { notificationId: n.id, userId } }, create: { notificationId: n.id, userId, readAt }, update: {} }),
    ),
  );
  return visible.length;
}
