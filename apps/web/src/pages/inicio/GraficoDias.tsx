import { useState } from 'react';
import type { Day, Key } from './dias';

/** Notas auditadas por dia (14 dias), com a dica ao passar o mouse ou focar. Clicar abre a primeira nota com erro do dia. */
export function GraficoDias({ days, focus, onPick }: { days: Day[]; focus: Key | null; onPick: (d: Day) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...days.map((x) => x.ok + x.err + x.canc));
  const step = max > 40 ? 10 : 5;
  const yMax = Math.ceil(max / step) * step || step;
  const ticks: { v: number; pos: number }[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push({ v, pos: (v / yMax) * 100 });
  const pc = (v: number) => ((v / yMax) * 100).toFixed(2) + '%';
  const segCls = (k: Key, top: Key) => `db-s s-${k}${k === top ? ' s-top' : ''}${focus && focus !== k ? ' is-dim' : ''}`;

  return (
    <div className="db-chart">
      <div className="db-chart-top"><h3>Notas auditadas por dia</h3><span>{days[0]?.label} a {days[13]?.label} · 14 dias</span></div>
      <div className="db-plot" onMouseLeave={() => setHover(null)}>
        <div className="db-yax" aria-hidden="true">{ticks.map((t) => <span key={t.v} style={{ bottom: t.pos + '%' }}>{t.v}</span>)}</div>
        <div className="db-area">
          {ticks.map((t) => <div key={t.v} className="db-gl" style={{ bottom: t.pos + '%' }} />)}
          <div className={'db-cols' + (hover !== null ? ' hovering' : '')}>
            {days.map((x, i) => {
              const t = x.ok + x.err + x.canc;
              const top: Key = x.canc ? 'canc' : x.err ? 'err' : 'ok';
              return (
                <button key={i} type="button" className={'db-col' + (hover === i ? ' is-hot' : '')} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onPick(x)} aria-label={`${x.label}: ${x.ok} em conformidade, ${x.err} com erro, ${x.canc} canceladas`}>
                  <div className="db-stack" style={{ animationDelay: `${(0.25 + i * 0.05).toFixed(2)}s` }}>
                    <div className={segCls('canc', top)} style={{ height: pc(x.canc) }} />
                    <div className={segCls('err', top)} style={{ height: pc(x.err) }} />
                    <div className={segCls('ok', top)} style={{ height: pc(x.ok) }} />
                  </div>
                  {hover === i && (
                    <div className={'db-tip' + (i < 2 ? ' tip-l' : i > 11 ? ' tip-r' : '')}>
                      <h4>{x.wk}, {x.label} · {t} {t === 1 ? 'nota' : 'notas'}</h4>
                      <p><i style={{ background: 'var(--db-ok)' }} />Em conformidade<b>{x.ok}</b></p>
                      <p><i style={{ background: 'var(--db-err)' }} />Com erro<b>{x.err}</b></p>
                      <p><i style={{ background: 'var(--db-canc)' }} />Canceladas<b>{x.canc}</b></p>
                      <p className="tip-rate">Taxa de erro<b>{t ? Math.round((x.err / t) * 100) + '%' : '—'}</b></p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="db-xax" aria-hidden="true">{days.map((x, i) => <span key={i} className={x.weekend ? 'xwe' : ''}>{x.label}</span>)}</div>
      <p className="db-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>Clique em um dia para abrir o diagnóstico da primeira nota com erro daquele dia.</p>
    </div>
  );
}
