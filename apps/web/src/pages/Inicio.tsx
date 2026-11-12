import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { REFORMA, type DashboardDTO, type DirectionFilter } from '@nay/shared';
import { useSession } from '../lib/session';
import { EmptyState } from '../lib/ui';
import { useOpenNote } from '../components/note-drawer';
import { useDashboard } from '../hooks/useDashboard';
import { useDirection } from '../lib/direction';
import '../styles/painel.css';

type Key = 'ok' | 'err' | 'canc';
type Day = { date: Date; label: string; wk: string; weekend: boolean; ok: number; err: number; canc: number; firstErr: string | null; first: string | null };

const WK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SERIES: { key: Key; label: string; color: string }[] = [
  { key: 'ok', label: 'Em conformidade', color: 'var(--db-ok)' },
  { key: 'err', label: 'Com erro', color: 'var(--db-err)' },
  { key: 'canc', label: 'Canceladas', color: 'var(--db-canc)' },
];
const RING_C = 2 * Math.PI * 80;
const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const pct1 = (v: number, t: number) => (t ? ((v / t) * 100).toFixed(1).replace('.', ',') : '0,0') + '%';

/** Últimos 14 dias com notas, terminando no dia da nota mais recente (a carteira pode estar parada há dias). */
function lastDays(barcode: DashboardDTO['barcode']): Day[] {
  if (!barcode.length) return [];
  const end = new Date(Math.max(...barcode.map((b) => new Date(b.issuedAt).getTime())));
  end.setHours(0, 0, 0, 0);
  const days: Day[] = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (13 - i));
    return { date, label: fmtDay(date), wk: WK[date.getDay()], weekend: date.getDay() === 0 || date.getDay() === 6, ok: 0, err: 0, canc: 0, firstErr: null, first: null };
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

/** Número que sobe até o alvo (mesma curva do mockup). */
function useCount(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      const val = Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      from.current = val;
      setV(val);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const DIRS: { v: DirectionFilter; l: string }[] = [{ v: 'entrada', l: 'Entradas' }, { v: 'saida', l: 'Saídas' }, { v: 'all', l: 'Todas' }];

export function Inicio() {
  const { user, client } = useSession();
  const openNote = useOpenNote();
  const nav = useNavigate();
  const [direction, setDirection] = useDirection();
  const [focus, setFocus] = useState<Key | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const q = useDashboard(client?.id, { direction });
  const d = q.data;

  const counts = useMemo(() => {
    const t = d?.totals;
    return { ok: t ? t.ok + t.atencao : 0, err: t?.erro ?? 0, canc: t?.cancelada ?? 0 };
  }, [d]);
  const total = counts.ok + counts.err + counts.canc;
  const days = useMemo(() => lastDays(d?.barcode ?? []), [d]);

  const fs = SERIES.find((s) => s.key === focus);
  const shown = useCount(fs ? Math.round((counts[fs.key] / (total || 1)) * 100) : total ? Math.round((counts.ok / total) * 100) : 0);

  if (!client) return <section className="view on"><EmptyState icon="ti-building-store" title="Cadastre seu primeiro cliente" text="As notas e a auditoria aparecem aqui depois que você cadastrar um cliente." /></section>;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const since = Math.max(0, Math.floor((Date.now() - new Date(REFORMA.grupoObrigatorioDesde + 'T00:00:00-03:00').getTime()) / 864e5));
  const need = d ? d.totals.erro + d.totals.atencao : 0;

  // anel
  const gap = counts.canc ? 6 : 5;
  let acc = 0;
  const ring = SERIES.filter((s) => counts[s.key] > 0).map((s) => {
    const len = Math.max(0, (counts[s.key] / total) * RING_C - gap);
    const seg = { s, dash: `${len.toFixed(1)} ${RING_C.toFixed(1)}`, off: (-acc).toFixed(1) };
    acc += (counts[s.key] / total) * RING_C;
    return seg;
  });

  // gráfico por dia
  const max = Math.max(0, ...days.map((x) => x.ok + x.err + x.canc));
  const step = max > 40 ? 10 : 5;
  const yMax = Math.ceil(max / step) * step || step;
  const ticks: { v: number; pos: number }[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push({ v, pos: (v / yMax) * 100 });
  const pc = (v: number) => ((v / yMax) * 100).toFixed(2) + '%';
  const segCls = (k: Key, top: Key) => `db-s s-${k}${k === top ? ' s-top' : ''}${focus && focus !== k ? ' is-dim' : ''}`;

  const tiles: { key: Key | null; label: string; value: number; color: string; bar: string }[] = [
    { key: null, label: 'Notas auditadas', value: total, color: 'var(--text)', bar: 'var(--uva)' },
    { key: 'ok', label: 'Em conformidade', value: counts.ok, color: 'var(--db-ok)', bar: 'var(--db-ok)' },
    { key: 'err', label: 'Com erro', value: counts.err, color: 'var(--db-err-t)', bar: 'var(--db-err)' },
    { key: 'canc', label: 'Canceladas', value: counts.canc, color: 'var(--muted)', bar: 'var(--db-canc)' },
  ];

  const maxErr = Math.max(1, ...(d?.topErrors ?? []).map((e) => e.items));
  const ent = d?.verdicts.entradas;
  const sai = d?.verdicts.saidas;
  const entTotal = ent ? ent.pode_creditar + ent.credito_em_risco + ent.nao_creditar : 0;
  const saiTotal = sai ? sai.correta + sai.corrigir + sai.cancelar_reemitir : 0;

  const pickDay = (x: Day) => { const id = x.firstErr ?? x.first; if (id) openNote(id); };
  const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

  const meter = (sum: number, parts: [number, string][]) => (
    <div className="db-meter">
      {parts.filter(([n]) => n > 0).map(([n, c], i) => <div key={i} style={{ width: `${(n / (sum || 1)) * 100}%`, background: c, minWidth: n / (sum || 1) < 0.03 ? 8 : undefined, animationDelay: `${0.4 + i * 0.1}s` }} />)}
    </div>
  );

  return (
    <section className="view on" aria-labelledby="h-inicio">
      <div className="db">
        <div className="db-head">
          <div>
            <h1 className="db-h1" id="h-inicio">{greet}, {user?.name.split(' ')[0]}</h1>
            <p>A carteira da {client.name} tem <b>{need} {need === 1 ? 'nota' : 'notas'}</b> que {need === 1 ? 'precisa' : 'precisam'} de atenção.</p>
          </div>
          <div className="db-actions">
            <div className="db-seg" role="group" aria-label="Direção das notas">
              <span className="db-seg-pill" aria-hidden="true" style={{ ['--idx' as string]: DIRS.findIndex((x) => x.v === direction) }} />
              {DIRS.map((x) => <button key={x.v} type="button" className={direction === x.v ? 'is-on' : ''} aria-pressed={direction === x.v} onClick={() => { setDirection(x.v); setFocus(null); }}>{x.l}</button>)}
            </div>
            <Link className="db-btn" to="/importar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 17" /><path d="M12 12v8M9 15l3-3 3 3" /></svg>Importar notas</Link>
            <Link className="db-btn is-pri" to="/auditoria"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M12 8v4M12 15.5v.01" /></svg>Ver erros</Link>
          </div>
        </div>

        <section className="db-card" style={delay(0.1)} aria-label="Saúde da carteira">
          <div className="db-card-h">
            <div>
              <h2 className="db-h2">Saúde da carteira</h2>
              <p className="db-sub">Como estão as notas auditadas. Passe o mouse nos dias e clique na legenda para isolar um status.</p>
            </div>
            <div className="db-meta">
              {d?.lastAuditAt && <><span className="db-live" aria-hidden="true" />Última auditoria {new Date(d.lastAuditAt).toLocaleDateString('pt-BR')}, {new Date(d.lastAuditAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
            </div>
          </div>

          {!d ? (
            <div className="skel" style={{ height: 250 }} />
          ) : total === 0 ? (
            <EmptyState icon="ti-chart-donut" title="Nenhuma nota ainda" text="Importe os XMLs do cliente para ver a saúde da carteira." action={<Link className="btn primary" to="/importar">Importar notas</Link>} />
          ) : (
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
                        <i style={{ background: s.key === 'canc' ? 'repeating-linear-gradient(-45deg,var(--db-canc) 0 2px,#4E4470 2px 4px)' : s.color }} />
                        <span>{s.label}</span><b>{counts[s.key].toLocaleString('pt-BR')}</b><em>{pct1(counts[s.key], total)}</em>
                      </button>
                    ))}
                  </div>
                </div>

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
                            <button key={i} type="button" className={'db-col' + (hover === i ? ' is-hot' : '')} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => pickDay(x)} aria-label={`${x.label}: ${x.ok} em conformidade, ${x.err} com erro, ${x.canc} canceladas`}>
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
              </div>

              <div className="db-tiles">
                {tiles.map((t, i) => (
                  <button key={i} type="button" className={'db-tile' + ((t.key ? focus === t.key : !focus) ? ' is-on' : '')} onClick={() => setFocus(t.key)} style={delay(0.25 + i * 0.07)}>
                    <strong style={{ color: t.color }}>{t.value.toLocaleString('pt-BR')}</strong><span>{t.label}</span>
                    <div className="tbar" style={{ width: `${total ? (t.value / total) * 100 : 0}%`, background: t.bar }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {d && ent && sai && (
          <div className="db-two">
            <section className="db-card" style={delay(0.2)}>
              <div className="db-card-h"><div><h2 className="db-h2">Notas de fornecedores</h2><p className="db-sub">Posso tomar crédito de IBS/CBS?</p></div><div className="db-meta">{entTotal} notas</div></div>
              {meter(entTotal, [[ent.pode_creditar, 'var(--db-good)'], [ent.credito_em_risco, 'var(--db-warn)'], [ent.nao_creditar, 'var(--db-err)']])}
              <div className="db-trio">
                <button type="button" className="db-mini" onClick={() => { setDirection('entrada'); nav('/notas?veredito=pode_creditar'); }}><strong>{ent.pode_creditar}</strong><span className="db-pill p-g">podem creditar</span></button>
                <button type="button" className="db-mini" onClick={() => { setDirection('entrada'); nav('/notas?veredito=credito_em_risco'); }}><strong style={{ color: 'var(--db-warn-t)' }}>{ent.credito_em_risco}</strong><span className="db-pill p-w">crédito em risco</span></button>
                <button type="button" className="db-mini" onClick={() => { setDirection('entrada'); nav('/notas?veredito=nao_creditar'); }}><strong style={{ color: 'var(--db-err-t)' }}>{ent.nao_creditar}</strong><span className="db-pill p-r">não creditar</span></button>
              </div>
            </section>
            <section className="db-card" style={delay(0.28)}>
              <div className="db-card-h"><div><h2 className="db-h2">Minhas notas</h2><p className="db-sub">Estou emitindo certo?</p></div><div className="db-meta">{saiTotal} notas</div></div>
              {meter(saiTotal, [[sai.correta, 'var(--db-good)'], [sai.corrigir, 'var(--db-warn)'], [sai.cancelar_reemitir, 'var(--db-err)']])}
              <div className="db-trio">
                <button type="button" className="db-mini" onClick={() => { setDirection('saida'); nav('/notas?veredito=correta'); }}><strong>{sai.correta}</strong><span className="db-pill p-g">{sai.correta === 1 ? 'correta' : 'corretas'}</span></button>
                <button type="button" className="db-mini" onClick={() => { setDirection('saida'); nav('/notas?veredito=corrigir'); }}><strong style={{ color: 'var(--db-warn-t)' }}>{sai.corrigir}</strong><span className="db-pill p-w">corrigir</span></button>
                <button type="button" className="db-mini" onClick={() => { setDirection('saida'); nav('/notas?veredito=cancelar_reemitir'); }}><strong style={{ color: 'var(--db-err-t)' }}>{sai.cancelar_reemitir}</strong><span className="db-pill p-r">cancelar e reemitir</span></button>
              </div>
            </section>
          </div>
        )}

        <div className="db-bottom">
          <section className="db-card" style={delay(0.34)}>
            <div className="db-card-h"><div><h2 className="db-h2">Erros mais comuns</h2><p className="db-sub">Corrija os primeiros e a maior parte some.</p></div><div className="db-meta">itens afetados</div></div>
            <div className="db-errs">
              {(d?.topErrors ?? []).map((e, i) => (
                <button key={e.code} type="button" className="db-er" onClick={() => nav('/auditoria?regra=' + e.code)}>
                  <span className="en">{i + 1}</span><span className="et">{e.title}</span><span className="ev">{e.items}</span>
                  <div className="etrack"><div className="efill" style={{ width: Math.max(2, (e.items / maxErr) * 100) + '%', animationDelay: `${0.5 + i * 0.1}s` }} /></div>
                </button>
              ))}
              {d && !d.topErrors.length && <p className="db-sub">Nenhum erro encontrado nesta carteira.</p>}
            </div>
          </section>
          <section className="db-card db-ref" style={delay(0.4)}>
            <h2 className="db-h2">Reforma 2026</h2>
            <p className="db-sub">Alíquotas da fase de teste</p>
            <div className="db-rates">
              <div className="db-rate"><strong>0,9%</strong><span>CBS em teste</span></div>
              <div className="db-rate"><strong>0,1%</strong><span>IBS em teste</span></div>
            </div>
            <p className="dnote">Grupo IBS/CBS obrigatório desde 03/08/2026, há {since} {since === 1 ? 'dia' : 'dias'}.</p>
          </section>
        </div>
      </div>
    </section>
  );
}
