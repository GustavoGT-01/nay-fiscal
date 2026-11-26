import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DirectionFilter } from '@nay/shared';
import { useSession } from '../lib/session';
import { EmptyState, QueryError } from '../lib/ui';
import { useCountUp } from '../lib/widgets';
import { useOpenNote } from '../components/note-drawer';
import { useDashboard } from '../hooks/useDashboard';
import { useDirection } from '../lib/direction';
import { SERIES, type Key } from './inicio/dias';
import { delay, Saude } from './inicio/Saude';
import { Rodape, Vereditos } from './inicio/Paineis';
import '../styles/painel.css';

const DIRS: { v: DirectionFilter; l: string }[] = [{ v: 'entrada', l: 'Entradas' }, { v: 'saida', l: 'Saídas' }, { v: 'all', l: 'Todas' }];

export function Inicio() {
  const { user, client } = useSession();
  const openNote = useOpenNote();
  const [direction, setDirection] = useDirection();
  const [focus, setFocus] = useState<Key | null>(null);
  const q = useDashboard(client?.id, { direction });
  const d = q.data;

  const counts = useMemo(() => {
    const t = d?.totals;
    return { ok: t ? t.ok + t.atencao : 0, err: t?.erro ?? 0, canc: t?.cancelada ?? 0 };
  }, [d]);
  const total = counts.ok + counts.err + counts.canc;

  const fs = SERIES.find((s) => s.key === focus);
  const shown = useCountUp(fs ? Math.round((counts[fs.key] / (total || 1)) * 100) : total ? Math.round((counts.ok / total) * 100) : 0);

  if (!client) return <section className="view on"><EmptyState icon="ti-building-store" title="Cadastre seu primeiro cliente" text="As notas e a auditoria aparecem aqui depois que você cadastrar um cliente." /></section>;

  const h = new Date().getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const need = d ? d.totals.erro + d.totals.atencao : 0;

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
            q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} what="o painel" /> : <div className="skel" style={{ height: 250 }} />
          ) : total === 0 ? (
            <EmptyState icon="ti-chart-donut" title="Nenhuma nota ainda" text="Importe os XMLs do cliente para ver a saúde da carteira." action={<Link className="btn primary" to="/importar">Importar notas</Link>} />
          ) : (
            <Saude data={d} counts={counts} focus={focus} setFocus={setFocus} shown={shown} onOpenNote={openNote} />
          )}
        </section>

        {d && <Vereditos verdicts={d.verdicts} onDirection={setDirection} />}
        <Rodape errors={d?.topErrors} />
      </div>
    </section>
  );
}
