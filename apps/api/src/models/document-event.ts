import { prisma } from '../config/db.js';

export type DocumentChange = 'substituida' | 'recusada' | 'cancelada';

/** Historico de quem substituiu, tentou substituir ou cancelou uma nota. */
export const record = (data: { officeId: string; clientId: string; key: string; number: string; type: DocumentChange; userId: string | null; userName: string; uploadId: string }) =>
  prisma.documentEvent.create({ data });
