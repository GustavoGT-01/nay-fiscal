import { useMemo, type CSSProperties } from 'react';
import type { DashboardDTO } from '@nay/shared';
import { lastDays, SERIES, type Day, type Key } from './dias';
import { GraficoDias } from './GraficoDias';

const RING_C = 2 * Math.PI * 80;
const pct1 = (v: number, t: number) => (t ? ((v / t) * 100).toFixed(1).replace('.', ',') : '0,0') + '%';
export const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

export type Counts = Record<Key, number>;

/** Anel, legenda (isola um status), grafico por dia e os quatro cartoes de contagem. */
export function Saude({ data, counts, focus, setFocus, shown, onOpenNote }: {
  data: DashboardDTO; counts: Counts; focus: Key | null; setFocus: (k: Key | null) => void;
  /** percentual do centro do anel, ja animado */
  shown: number; onOpenNote: (id: string) => void;
}) {
  const total = counts.ok + counts.err + counts.canc;
  const days = useMemo(() => lastDays(data.barcode), [data]);
  const fs = SERIES.find((s) => s.key === focus);

  const gap = counts.canc ? 6 : 5;
  let acc = 0;
  const ring = SERIES.filter((s) => counts[s.key] > 0).map((s) => {
    const len = Math.max(0, (counts[s.key] / total) * RING_C - gap);
    const seg = { s, dash: `${len.toFixed(1)} ${RING_C.toFixed(1)}`, off: (-acc).toFixed(1) };
    acc += (counts[s.key] / total) * RING_C;
    return seg;
  });

  const tiles: { key: Key | null; label: string; value: number; color: string; bar: string }[] = [
    { key: null, label: 'Notas auditadas', value: total, color: 'var(--text)', bar: 'var(--uva)' },
    { key: 'ok', label: 'Em conformidade', value: counts.ok, color: 'var(--db-ok)', bar: 'var(--db-ok)' },
    { key: 'err', label: 'Com erro', value: counts.err, color: 'var(--db-err-t)', bar: 'var(--db-err)' },
    { key: 'canc', label: 'Canceladas', value: counts.canc, color: 'var(--muted)', bar: 'var(--db-canc)' },
  ];

  const pickDay = (x: Day) => { const id = x.firstErr ?? x.first; if (id) onOpenNote(id); };

  return (
    <>
      <div className="db-health">
        <div className="db-ringbox">
          <div className="db-ring" role="img" aria-label={`${counts.ok} de ${total} notas em conformidade`}>
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="80" style={{ stroke: 'var(--db-s2)' }} />
              {ring.map(({ s, dash, off }) => (
                <circle key={s.key} className={'rseg' + (focus && focus !== s.key ? ' is-dim' : '')} cx="100" cy="100" r="80" style={{ stroke: s.color, strokeDasharray: dash, strokeDashoffset: off }} />
              ))}
            </svg>
            <div className="db-ring-c"><strong>{shown}%</strong><span>{fs ? fs.label.toLowerCase() : 'em conformidade'}</span></div>
          </div>
          <div className="db-legend">
            {SERIES.map((s) => (
              <button key={s.key} type="button" className={'db-leg' + (focus === s.key ? ' is-on' : focus ? ' is-dim' : '')} aria-pressed={focus === s.key} onClick={() => setFocus(focus === s.key ? null : s.key)}>
                <i style={{ background: s.key === 'canc' ? 'repeating-linear-gradient(-45deg,var(--db-canc) 0 2px,var(--db-canc-2) 2px 4px)' : s.color }} />
                <span>{s.label}</span><b>{counts[s.key].toLocaleString('pt-BR')}</b><em>{pct1(counts[s.key], total)}</em>
              </button>
            ))}
          </div>
        </div>

        <GraficoDias days={days} focus={focus} onPick={pickDay} />
      </div>

      <div className="db-tiles">
        {tiles.map((t, i) => (
          <button key={i} type="button" className={'db-tile' + ((t.key ? focus === t.key : !focus) ? ' is-on' : '')} aria-pressed={t.key ? focus === t.key : !focus} onClick={() => setFocus(t.key)} style={delay(0.25 + i * 0.07)}>
            <strong style={{ color: t.color }}>{t.value.toLocaleString('pt-BR')}</strong><span>{t.label}</span>
            <div className="tbar" style={{ width: `${total ? (t.value / total) * 100 : 0}%`, background: t.bar }} />
          </button>
        ))}
      </div>
    </>
  );
}
