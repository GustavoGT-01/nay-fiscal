import { useNavigate } from 'react-router-dom';
import { dataBR, inicioDoDia, REFORMA, type DashboardDTO, type DirectionFilter } from '@nay/shared';
import { Meter } from '../../lib/widgets';
import { delay } from './Saude';

/** Notas de entrada (posso creditar?) e de saida (estou emitindo certo?), lado a lado. */
export function Vereditos({ verdicts, onDirection }: { verdicts: DashboardDTO['verdicts']; onDirection: (d: DirectionFilter) => void }) {
  const nav = useNavigate();
  const ent = verdicts.entradas;
  const sai = verdicts.saidas;
  const entTotal = ent.pode_creditar + ent.credito_em_risco + ent.nao_creditar;
  const saiTotal = sai.correta + sai.corrigir + sai.cancelar_reemitir;
  const ir = (d: DirectionFilter, veredito: string) => () => { onDirection(d); nav('/notas?veredito=' + veredito); };
  const barra = (total: number, parts: [number, string][]) => <Meter className="db-meter" total={total} parts={parts} minPx={8} stagger={0.4} />;

  return (
    <div className="db-two">
      <section className="db-card" style={delay(0.2)}>
        <div className="db-card-h"><div><h2 className="db-h2">Notas de fornecedores</h2><p className="db-sub">Posso tomar crédito de IBS/CBS?</p></div><div className="db-meta">{entTotal} notas</div></div>
        {barra(entTotal, [[ent.pode_creditar, 'var(--db-good)'], [ent.credito_em_risco, 'var(--db-warn)'], [ent.nao_creditar, 'var(--db-err)']])}
        <div className="db-trio">
          <button type="button" className="db-mini" onClick={ir('entrada', 'pode_creditar')}><strong>{ent.pode_creditar}</strong><span className="db-pill p-g">podem creditar</span></button>
          <button type="button" className="db-mini" onClick={ir('entrada', 'credito_em_risco')}><strong style={{ color: 'var(--db-warn-t)' }}>{ent.credito_em_risco}</strong><span className="db-pill p-w">crédito em risco</span></button>
          <button type="button" className="db-mini" onClick={ir('entrada', 'nao_creditar')}><strong style={{ color: 'var(--db-err-t)' }}>{ent.nao_creditar}</strong><span className="db-pill p-r">não creditar</span></button>
        </div>
      </section>
      <section className="db-card" style={delay(0.28)}>
        <div className="db-card-h"><div><h2 className="db-h2">Minhas notas</h2><p className="db-sub">Estou emitindo certo?</p></div><div className="db-meta">{saiTotal} notas</div></div>
        {barra(saiTotal, [[sai.correta, 'var(--db-good)'], [sai.corrigir, 'var(--db-warn)'], [sai.cancelar_reemitir, 'var(--db-err)']])}
        <div className="db-trio">
          <button type="button" className="db-mini" onClick={ir('saida', 'correta')}><strong>{sai.correta}</strong><span className="db-pill p-g">{sai.correta === 1 ? 'correta' : 'corretas'}</span></button>
          <button type="button" className="db-mini" onClick={ir('saida', 'corrigir')}><strong style={{ color: 'var(--db-warn-t)' }}>{sai.corrigir}</strong><span className="db-pill p-w">corrigir</span></button>
          <button type="button" className="db-mini" onClick={ir('saida', 'cancelar_reemitir')}><strong style={{ color: 'var(--db-err-t)' }}>{sai.cancelar_reemitir}</strong><span className="db-pill p-r">cancelar e reemitir</span></button>
        </div>
      </section>
    </div>
  );
}

/** Os erros que mais afetam itens e o lembrete das aliquotas de teste da Reforma. */
export function Rodape({ errors }: { errors: DashboardDTO['topErrors'] | undefined }) {
  const nav = useNavigate();
  const maxErr = Math.max(1, ...(errors ?? []).map((e) => e.items));
  const since = Math.max(0, Math.floor((Date.now() - inicioDoDia(REFORMA.grupoObrigatorioDesde).getTime()) / 864e5));
  return (
    <div className="db-bottom">
      <section className="db-card" style={delay(0.34)}>
        <div className="db-card-h"><div><h2 className="db-h2">Erros mais comuns</h2><p className="db-sub">Corrija os primeiros e a maior parte some.</p></div><div className="db-meta">itens afetados</div></div>
        <div className="db-errs">
          {(errors ?? []).map((e, i) => (
            <button key={e.code} type="button" className="db-er" onClick={() => nav('/auditoria?regra=' + e.code)}>
              <span className="en">{i + 1}</span><span className="et">{e.title}</span><span className="ev">{e.items}</span>
              <div className="etrack"><div className="efill" style={{ width: Math.max(2, (e.items / maxErr) * 100) + '%', animationDelay: `${0.5 + i * 0.1}s` }} /></div>
            </button>
          ))}
          {errors && !errors.length && <p className="db-sub">Nenhum erro encontrado nesta carteira.</p>}
        </div>
      </section>
      <section className="db-card db-ref" style={delay(0.4)}>
        <h2 className="db-h2">Reforma 2026</h2>
        <p className="db-sub">Alíquotas da fase de teste</p>
        <div className="db-rates">
          <div className="db-rate"><strong>0,9%</strong><span>CBS em teste</span></div>
          <div className="db-rate"><strong>0,1%</strong><span>IBS em teste</span></div>
        </div>
        <p className="dnote">Grupo IBS/CBS obrigatório desde {dataBR(REFORMA.grupoObrigatorioDesde)}, há {since} {since === 1 ? 'dia' : 'dias'}.</p>
      </section>
    </div>
  );
}
