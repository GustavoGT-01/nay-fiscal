import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreditRowDTO } from '@nay/shared';
import { brl, fmtCnpj } from '../lib/api';
import { PERIODS } from '../lib/periods';
import { useSession } from '../lib/session';
import { EmptyState, QueryError, Seg, useToast } from '../lib/ui';
import { useCredits } from '../hooks/useCredits';

type Group = 'forn' | 'mes';

/** Situacao do credito de uma linha: o pior caso decide o selo. */
function Situacao({ r }: { r: CreditRowDTO }) {
  const n = (x: number) => (x === 1 ? '1 nota' : `${x} notas`);
  if (r.risco > 0) return <span className="tag atencao">Em risco: {n(r.risco)} com erro</span>;
  if (r.nao > 0) return <span className="tag erro">{r.pode > 0 ? `Não creditar: ${n(r.nao)}` : 'Não creditar'}</span>;
  return <span className="tag ok">Pode creditar</span>;
}

/** CSV para Excel pt-BR: separador ";", virgula decimal e BOM para os acentos. */
function csv(rows: CreditRowDTO[], group: Group) {
  const num = (v: number) => v.toFixed(2).replace('.', ',');
  const head = [group === 'forn' ? 'Fornecedor' : 'Mês', ...(group === 'forn' ? ['CNPJ'] : []), 'Notas', 'IBS', 'CBS', 'Notas que podem creditar', 'Notas com crédito em risco', 'Notas que não creditam'];
  const q = (s: string) => `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // texto que comeca com = + - @ viraria formula no Excel
  const lines = rows.map((r) => [q(r.label), ...(group === 'forn' ? [q(fmtCnpj(r.key))] : []), r.notes, num(r.ibs), num(r.cbs), r.pode, r.risco, r.nao].join(';'));
  return '﻿' + [head.map(q).join(';'), ...lines].join('\r\n');
}

export function Creditos() {
  const { client } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [group, setGroup] = useState<Group>('forn');
  const [period, setPeriod] = useState('all');
  const p = PERIODS.find((x) => x.key === period)!;
  const q = useCredits(client?.id, group, p.from, p.to);
  const d = q.data;

  const exportar = () => {
    if (!d?.rows.length) return toast('Nada para exportar neste período.', 'ti-alert-triangle');
    const url = URL.createObjectURL(new Blob([csv(d.rows, group)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `creditos-${client?.cnpj || 'cliente'}-${group === 'forn' ? 'fornecedor' : 'mes'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Créditos exportados', 'ti-download');
  };

  const vazio = d && !d.rows.length && !d.notAudited && !d.totals.pode && !d.totals.risco && !d.totals.nao;

  return (
    <section className="view on" aria-labelledby="h-cred">
      <div className="hello">
        <div>
          <h1 id="h-cred">Créditos</h1>
          <p className="lede">Quanto de IBS e CBS destacado nas notas de <b>entrada</b> a <span className="cname">{client?.name}</span> pode aproveitar, e quanto está em risco por erro na nota do fornecedor.</p>
        </div>
        <button className="btn" onClick={exportar} disabled={!d?.rows.length}><i className="ti ti-download" />Exportar</button>
      </div>

      {q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} what="os créditos" /> : (
        <>
          <div className="kpis">
            <div className="kpi good"><strong>{brl(d?.totals.pode ?? 0)}</strong><small>Pode creditar (notas sem erro)</small></div>
            <div className="kpi warn"><strong>{brl(d?.totals.risco ?? 0)}</strong><small>Crédito em risco (nota com erro)</small></div>
            <div className="kpi bad"><strong>{brl(d?.totals.nao ?? 0)}</strong><small>Não creditar (cancelada ou sem autorização)</small></div>
          </div>
          {!!d?.notAudited && <p className="hint" style={{ marginBottom: 12 }}>{d.notAudited.toLocaleString('pt-BR')} notas de entrada ainda não foram auditadas e não entram nos valores. <button className="btn" style={{ padding: '4px 10px' }} onClick={() => nav('/auditoria')}>Ir para a Auditoria</button></p>}
          <div className="toolbar" style={{ marginTop: 0 }}>
            <Seg<Group> label="Agrupar" value={group} onChange={setGroup} options={[{ value: 'forn', label: 'Por fornecedor' }, { value: 'mes', label: 'Por mês' }]} />
            <select className="select" style={{ width: 'auto', marginLeft: 'auto', paddingRight: 40 }} aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          {vazio ? (
            <EmptyState icon="ti-coins" title="Nenhuma nota de entrada neste período" text="Os créditos vêm das notas em que o cliente é o destinatário. Importe as notas de compra ou escolha outro período." action={<button className="btn primary" onClick={() => nav('/importar')}>Importar notas</button>} />
          ) : (
            <div className="table-wrap">
              {q.isLoading ? <div className="skel" style={{ height: 240, margin: 16 }} /> : (
                <table className="table static">
                  <thead><tr><th scope="col">{group === 'forn' ? 'Fornecedor' : 'Mês'}</th><th scope="col" className="r">Notas</th><th scope="col" className="r">IBS</th><th scope="col" className="r">CBS</th><th scope="col">Situação do crédito</th></tr></thead>
                  <tbody>
                    {d?.rows.map((r) => (
                      <tr key={r.key}>
                        <td>{group === 'forn' ? <button type="button" className="th-sort" style={{ fontWeight: 600 }} onClick={() => nav(`/notas?fornecedor=${r.key}`)}>{r.label}</button> : r.label}</td>
                        <td className="r num">{r.notes.toLocaleString('pt-BR')}</td>
                        <td className="r num">{brl(r.ibs)}</td>
                        <td className="r num">{brl(r.cbs)}</td>
                        <td><Situacao r={r} /></td>
                      </tr>
                    ))}
                    {d && !d.rows.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhuma nota auditada neste período.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <p className="hint" style={{ marginTop: 12 }}>Os valores somam o IBS e a CBS gravados em cada nota de entrada, agrupados pelo veredito já calculado. Nada é recalculado aqui.</p>
        </>
      )}
    </section>
  );
}
