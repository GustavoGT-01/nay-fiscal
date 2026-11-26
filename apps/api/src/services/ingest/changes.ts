import type { DocumentChange } from '../../models/document-event.js';
import * as notifications from '../../models/notification.js';
import * as users from '../../models/user.js';

/** Mudanca numa nota ja guardada, vinda de um arquivo do envio. */
export interface Change { type: DocumentChange; key: string; number: string; file: string }

/** Nome de quem enviou (vazio em envios antigos ou internos). */
export async function authorName(userId: string | null) {
  return userId ? (await users.findByIdOrNull(userId))?.name ?? '' : '';
}

const PARTES: [DocumentChange, string][] = [['recusada', 'recusada(s)'], ['substituida', 'substituída(s)'], ['cancelada', 'cancelada(s)']];

/** Um aviso por envio (nao um por nota), com os numeros das primeiras notas de cada tipo. */
export async function notifyChanges(officeId: string, userName: string, fileName: string, changed: Change[]) {
  if (!changed.length) return;
  const resumo = PARTES.flatMap(([type, texto]) => {
    const l = changed.filter((c) => c.type === type);
    return l.length ? [`${l.length} ${texto} (nº ${l.slice(0, 5).map((c) => c.number).join(', ')}${l.length > 5 ? '…' : ''})`] : [];
  });
  const refused = changed.some((c) => c.type === 'recusada');
  await notifications.create({
    officeId,
    type: 'NOTAS_ALTERADAS',
    title: refused ? 'Nota recusada na importação' : 'Notas alteradas por importação',
    message: `${userName || 'Importação'} enviou ${fileName}: ${resumo.join('; ')}.`,
    severity: refused ? 'WARN' : 'INFO',
  });
}
