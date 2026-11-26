import { useState } from 'react';
import { Link } from 'react-router-dom';
import { brl, fmtDate } from '../lib/api';
import { useSession } from '../lib/session';
import { EmptyState, QueryError, Seg, StatusTag } from '../lib/ui';
import { Pager, rowProps } from '../lib/widgets';
import { useOpenNote } from '../components/note-drawer';
import { NFSE_PER_PAGE as PER, useNfse } from '../hooks/useNfse';

type Dir = 'all' | 'saida' | 'entrada';

/** NFS-e: servicos prestados (saida) e tomados (entrada), com ISS e retencoes. */
export function Nfse() {
  const { client } = useSession();
  const openNote = useOpenNote();
  const [dir, setDir] = useState<Dir>('all');
  const [page, setPage] = useState(0);

  const { sum, list } = useNfse(client?.id, dir, page);
  const s = sum.data;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  if (!client) return <section className="view on"><EmptyState icon="ti-receipt" title="Escolha um cliente" text="As NFS-e aparecem por cliente. Cadastre ou escolha um cliente no topo da tela." /></section>;

  return (
    <section className="view on" aria-labelledby="h-nfse">
      <h1 id="h-nfse">NFS-e</h1>
      <p className="lede">Notas de serviço do padrão nacional. A Nay confere o código do serviço, a alíquota e o cálculo do ISS, as retenções e o grupo IBS/CBS.</p>

      <div className="toolbar">
        <Seg<Dir> label="Prestadas ou tomadas" value={dir} onChange={(v) => { setDir(v); setPage(0); }}
          options={[{ value: 'saida', label: 'Prestadas' }, { value: 'entrada', label: 'Tomadas' }, { value: 'all', label: 'Todas' }]} />
      </div>

      {sum.isError && !list.isError && <QueryError error={sum.error} onRetry={() => sum.refetch()} what="os totais" />}
      {s && (
        <div className="kv nfse-kpis">
          <div><small>Notas</small><b>{s.notes}{s.withError ? <span className="tag erro" style={{ marginLeft: 8 }}>{s.withError} com erro</span> : null}</b></div>
          <div><small>Valor dos serviços</small><b>{brl(s.serviceValue)}</b></div>
          <div><small>ISS destacado</small><b>{brl(s.issValue)}</b></div>
          <div><small>ISS retido</small><b>{brl(s.issRetained)}</b></div>
          <div><small>Retenções federais</small><b>{brl(s.federalRetained)}</b></div>
          <div><small>Prestadas · tomadas</small><b>{s.prestadas} · {s.tomadas}</b></div>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 14 }}>
        {list.isLoading ? <div className="skel" style={{ height: 240, margin: 16 }} /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} what="as NFS-e" /> : total === 0 ? (
          <EmptyState icon="ti-receipt" title="Nenhuma NFS-e ainda"
            text="Importe os XMLs de NFS-e do padrão nacional (baixados no Emissor Nacional ou no portal da sua prefeitura conveniada)."
            action={<Link className="btn primary" to="/importar"><i className="ti ti-cloud-upload" />Importar NFS-e</Link>} />
        ) : (
          <table className="table">
            <thead><tr><th scope="col">Nota</th><th scope="col">Prestador ou tomador</th><th scope="col">Emissão</th><th scope="col">Serviço</th><th scope="col" className="r">Valor</th><th scope="col" className="r">ISS</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              {list.data?.rows.map((n) => (
                <tr key={n.id} {...rowProps(() => openNote(n.id))}>
                  <td><b className="num" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>NFS-e {n.number}</b><div className="hint" style={{ fontSize: 12 }}>{n.direction === 'saida' ? 'prestada' : 'tomada'}</div></td>
                  <td>{n.counterpart}</td>
                  <td>{fmtDate(n.issuedAt)}</td>
                  <td><span className="mono">{n.service?.code}</span><div className="hint" style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.service?.description}</div></td>
                  <td className="r num">{brl(n.total)}</td>
                  <td className="r num">{brl(n.service?.issValue ?? 0)}<div className="hint" style={{ fontSize: 12 }}>{(n.service?.issRate ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%{n.service?.retained ? ' · retido' : ''}</div></td>
                  <td><StatusTag status={n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > 0 && (
          <Pager summary={`${total} NFS-e`} page={page} pages={pages} onPage={setPage} />
        )}
      </div>
    </section>
  );
}
