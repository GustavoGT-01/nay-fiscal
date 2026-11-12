import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { REFORMA, type DashboardDTO } from '@nay/shared';
import { brl } from '../lib/api';
import { useSession } from '../lib/session';
import { CountUp, EmptyState } from '../lib/ui';
import { useOpenNote } from '../components/note-drawer';
import { useDashboard } from '../hooks/useDashboard';
import { DirectionSeg, useDirection } from '../lib/direction';
import { VERDICT } from '../lib/verdict';

type F = 'all' | 'ok' | 'erro' | 'cancelada';
const ST: Record<string, string> = { ok: 'em conformidade', atencao: 'com atenção', erro: 'com erro', cancelada: 'cancelada', pendente: 'pendente' };

export function Inicio() {
  const { user, client } = useSession();
  const openNote = useOpenNote();
  const nav = useNavigate();
  const [filter, setFilter] = useState<F>('all');
  const [intro, setIntro] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const [fills, setFills] = useState(false);
  const scanRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useDirection();

  const q = useDashboard(client?.id, { direction });
  const d = q.data;

  useEffect(() => {
    setIntro(true);
    setFills(false);
    const a = setTimeout(() => setIntro(false), 2200);
    const b = setTimeout(() => setFills(true), 500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [client?.id]);

  if (!client) return <section className="view on"><EmptyState icon="ti-building-store" title="Cadastre seu primeiro cliente" text="As notas e a auditoria aparecem aqui depois que você cadastrar um cliente." /></section>;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const days = Math.max(0, Math.floor((Date.now() - new Date(REFORMA.grupoObrigatorioDesde + 'T00:00:00-03:00').getTime()) / 864e5));
  const need = d ? d.totals.erro + d.totals.atencao : 0;
  const bars = d?.barcode ?? [];
  const okCount = d ? d.totals.ok + d.totals.atencao : 0;
  const digits = bars.length ? Array.from({ length: 7 }, (_, i) => bars[Math.min(bars.length - 1, Math.round((i * (bars.length - 1)) / 6))].number) : [];
  const maxErr = Math.max(1, ...(d?.topErrors ?? []).map((e) => e.items));
  const barClass = (s: string) => (s === 'erro' ? 'erro' : s === 'cancelada' ? 'cancelada' : 'ok');
  const matches = (s: string) => (filter === 'all' ? true : filter === 'ok' ? s === 'ok' || s === 'atencao' : s === filter);

  return (
    <section className="view on" aria-labelledby="h-inicio">
      <div className="hello">
        <div>
          <h1 id="h-inicio">{greet}, {user?.name.split(' ')[0]}</h1>
          <p className="lede">
            A carteira da <span className="cname">{client.name}</span> tem <b>{need} {need === 1 ? 'nota' : 'notas'}</b> que {need === 1 ? 'precisa' : 'precisam'} de atenção.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DirectionSeg value={direction} onChange={setDirection} />
          <Link className="btn" to="/importar"><i className="ti ti-cloud-upload" />Importar notas</Link>
          <Link className="btn primary" to="/auditoria"><i className="ti ti-shield-check" />Ver erros</Link>
        </div>
      </div>

      <div className="panel scanner" ref={scanRef}>
        <div className="scan-head">
          <div><h2>Código de barras da carteira</h2><p>Cada barra é uma nota. Passe o mouse para ver, clique para abrir o diagnóstico.</p></div>
          <span className="hint">{d?.lastAuditAt ? `Última auditoria ${new Date(d.lastAuditAt).toLocaleDateString('pt-BR')}, ${new Date(d.lastAuditAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ' '}</span>
        </div>
        {!d ? (
          <div className="skel" style={{ height: 150 }} />
        ) : bars.length === 0 ? (
          <EmptyState icon="ti-barcode" title="Nenhuma nota ainda" text="Importe os XMLs do cliente para montar o código de barras da carteira." action={<Link className="btn primary" to="/importar">Importar notas</Link>} />
        ) : (
          <>
            <div
              className={'barcode' + (intro ? ' intro' : '') + (filter !== 'all' ? ' filtering' : '')}
              role="img"
              aria-label={`${d.totals.audited} notas auditadas: ${okCount} em conformidade, ${d.totals.erro} com erro e ${d.totals.cancelada} canceladas`}
              onMouseLeave={() => { setTip(null); setHot(null); }}
            >
              <div className="laser" />
              {bars.map((b, i) => (
                <div
                  key={b.id}
                  className={`bar ${barClass(b.status)} w${b.weight}${Number(b.number) % 9 === 0 ? ' short' : ''}${matches(b.status) ? ' match' : ''}${hot === i ? ' hot' : ''}`}
                  style={{ ['--i' as string]: i }}
                  onMouseMove={(e) => {
                    const r = scanRef.current!.getBoundingClientRect();
                    const br = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setHot(i);
                    setTip({
                      x: Math.min(Math.max(e.clientX - r.left, 120), r.width - 120),
                      y: br.top - r.top,
                      html: <><b>NF-e {b.number}</b>, {brl(b.total)}<br />{b.counterpart}<br />{ST[b.status]}{b.topFinding && b.status !== 'ok' ? ': ' + b.topFinding : ''}</>,
                    });
                  }}
                  onClick={() => openNote(b.id)}
                />
              ))}
            </div>
            <div className="digits" aria-hidden="true">{digits.map((n, i) => <span key={i}>{n}</span>)}</div>
          </>
        )}
        {d && (
          <div className="legend">
            {([
              ['all', 'all', d.totals.audited, 'Notas auditadas'],
              ['ok', '', okCount, 'Em conformidade'],
              ['erro', 'erro', d.totals.erro, 'Com erro'],
              ['cancelada', 'cancelada', d.totals.cancelada, 'Canceladas'],
            ] as const).map(([f, sw, v, l]) => (
              <button key={f} className="leg" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                <span className={'sw ' + sw} />
                <span><CountUp to={v} style={f === 'erro' ? { color: 'var(--caju)' } : undefined} /><small>{l}</small></span>
              </button>
            ))}
          </div>
        )}
        <div className="tip" style={tip ? { left: tip.x, top: tip.y, opacity: 1 } : undefined}>{tip?.html}</div>
      </div>

      {d && (
        <div className="verdicts">
          <VerdictPanel
            title="Notas de fornecedores"
            text="Posso tomar crédito de IBS/CBS?"
            rows={[
              ['pode_creditar', d.verdicts.entradas.pode_creditar, 'podem creditar'],
              ['credito_em_risco', d.verdicts.entradas.credito_em_risco, 'crédito em risco'],
              ['nao_creditar', d.verdicts.entradas.nao_creditar, 'não creditar'],
            ]}
            onPick={(v) => { setDirection('entrada'); nav('/notas?veredito=' + v); }}
          />
          <VerdictPanel
            title="Minhas notas"
            text="Estou emitindo certo?"
            rows={[
              ['correta', d.verdicts.saidas.correta, d.verdicts.saidas.correta === 1 ? 'correta' : 'corretas'],
              ['corrigir', d.verdicts.saidas.corrigir, 'corrigir'],
              ['cancelar_reemitir', d.verdicts.saidas.cancelar_reemitir, 'cancelar e reemitir'],
            ]}
            onPick={(v) => { setDirection('saida'); nav('/notas?veredito=' + v); }}
          />
        </div>
      )}

      <div className="home-grid">
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2>Erros mais comuns</h2><span className="hint">itens afetados</span></div>
          <div className="errlist">
            {(d?.topErrors ?? []).map((e) => (
              <button key={e.code} className="err" onClick={() => nav('/auditoria?regra=' + e.code)}>
                <span>{e.title}</span><b>{e.items}</b>
                <span className="track"><span className="fill" style={{ display: 'block', width: fills ? Math.max(2, (e.items / maxErr) * 100) + '%' : 0 }} /></span>
              </button>
            ))}
            {d && !d.topErrors.length && <p className="hint">Nenhum erro encontrado nesta carteira.</p>}
          </div>
        </div>
        <div className="panel reforma">
          <div className="orb" />
          <h2>Reforma 2026</h2>
          <div className="rates">
            <div className="rate"><strong>0,9%</strong><small>CBS em teste</small></div>
            <div className="rate"><strong>0,1%</strong><small>IBS em teste</small></div>
          </div>
          <p className="since">Grupo IBS/CBS obrigatório desde 03/08/2026, há <b>{days} {days === 1 ? 'dia' : 'dias'}</b>.</p>
          <div className="acts">
            <Link className="btn primary" to="/simulador"><i className="ti ti-scale" />Simular Simples Híbrido</Link>
            <Link className="btn" to="/ia"><i className="ti ti-sparkles" />Perguntar à IA</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

type VKey = keyof typeof VERDICT;

function VerdictPanel({ title, text, rows, onPick }: { title: string; text: string; rows: [VKey, number, string][]; onPick: (v: VKey) => void }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="hint">{text}</p>
      <div className="vrows">
        {rows.map(([k, n, label]) => (
          <button key={k} className={'vrow ' + (n ? VERDICT[k].cls : '')} onClick={() => onPick(k)} aria-label={`${n} ${label}. Ver notas`}>
            <strong className="num">{n.toLocaleString('pt-BR')}</strong>
            <span className={'tag ' + VERDICT[k].cls}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}