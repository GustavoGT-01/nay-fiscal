import type { DashboardDTO } from '@nay/shared';

export type Key = 'ok' | 'err' | 'canc';
export type Day = { date: Date; label: string; wk: string; weekend: boolean; ok: number; err: number; canc: number; firstErr: string | null; first: string | null };

export const SERIES: { key: Key; label: string; color: string }[] = [
  { key: 'ok', label: 'Em conformidade', color: 'var(--db-ok)' },
  { key: 'err', label: 'Com erro', color: 'var(--db-err)' },
  { key: 'canc', label: 'Canceladas', color: 'var(--db-canc)' },
];

const WK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Últimos 14 dias com notas, terminando no dia da nota mais recente (a carteira pode estar parada há dias). */
export function lastDays(barcode: DashboardDTO['barcode']): Day[] {
  if (!barcode.length) return [];
  const end = new Date(Math.max(...barcode.map((b) => new Date(b.issuedAt).getTime())));
  end.setHours(0, 0, 0, 0);
  const days: Day[] = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (13 - i));
    return { date, label: fmtDay(date), wk: WK[date.getDay()] ?? '', weekend: date.getDay() === 0 || date.getDay() === 6, ok: 0, err: 0, canc: 0, firstErr: null, first: null };
  });
  const byKey = new Map(days.map((d) => [dayKey(d.date), d]));
  for (const b of barcode) {
    const d = byKey.get(dayKey(new Date(b.issuedAt)));
    if (!d) continue;
    const k: Key = b.status === 'erro' ? 'err' : b.status === 'cancelada' ? 'canc' : 'ok';
    d[k]++;
    d.first ??= b.id;
    if (k === 'err') d.firstErr ??= b.id;
  }
  return days;
}
