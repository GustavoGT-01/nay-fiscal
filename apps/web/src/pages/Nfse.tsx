import { useState } from 'react';
import { Link } from 'react-router-dom';
import { brl, fmtDate } from '../lib/api';
import { useSession } from '../lib/session';
import { EmptyState, Seg, StatusTag } from '../lib/ui';
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
        {list.isLoading ? <div className="skel" style={{ height: 240, margin: 16 }} /> : total === 0 ? (
          <EmptyState icon="ti-receipt" title="Nenhuma NFS-e ainda"
            text="Importe os XMLs de NFS-e do padrão nacional (baixados no Emissor Nacional ou no portal da sua prefeitura conveniada)."
            action={<Link className="btn primary" to="/importar"><i className="ti ti-cloud-upload" />Importar NFS-e</Link>} />
        ) : (
          <table className="table">
            <thead><tr><th>Nota</th><th>Prestador ou tomador</th><th>Emissão</th><th>Serviço</th><th className="r">Valor</th><th className="r">ISS</th><th>Situação</th></tr></thead>
            <tbody>
              {list.data?.rows.map((n) => (
                <tr key={n.id} tabIndex={0} onClick={() => openNote(n.id)} onKeyDown={(e) => e.key === 'Enter' && openNote(n.id)}>
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
          <div className="pager">
            <span>{total} NFS-e, página {page + 1} de {pages}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn" aria-label="Página anterior" onClick={() => setPage((p) => Math.max(0, p - 1))}><i className="ti ti-chevron-left" /></button>
              <button className="btn" aria-label="Próxima página" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}><i className="ti ti-chevron-right" /></button>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
