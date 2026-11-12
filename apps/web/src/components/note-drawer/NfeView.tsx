import type { NoteDetailDTO } from '@nay/shared';
import { brl } from '../../lib/api';

/** Itens e totais da nota (NF-e, NFC-e, CT-e), no lugar do bloco da NFS-e. */
export function NfeView({ n }: { n: NoteDetailDTO }) {
  return (
    <>
              <div className="section-t">Itens da nota</div>
              <div className="table-wrap" style={{ borderRadius: 16 }}>
                <table className="items">
                  <thead><tr><th>#</th><th>Descrição</th><th>CFOP</th><th>CST IBS/CBS</th><th>cClassTrib</th><th className="r">IBS</th><th className="r">CBS</th><th className="r">Valor</th></tr></thead>
                  <tbody>
                    {n.items.map((i) => (
                      <tr key={i.n}>
                        <td>{i.n}</td><td>{i.description}<div className="hint mono" style={{ fontSize: 11 }}>NCM {i.ncm}</div></td>
                        <td className="mono">{i.cfop}</td><td className="mono">{i.cstIbsCbs ?? '—'}</td><td className="mono">{i.cClassTrib ?? '—'}</td>
                        <td className="r">{brl(i.vIbs)}</td><td className="r">{brl(i.vCbs)}</td><td className="r">{brl(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="section-t">Totais</div>
              <div className="kv">
                <div><small>ICMS</small><b>{brl(n.taxes.vIcms)}</b></div>
                <div><small>PIS + COFINS</small><b>{brl(n.taxes.vPis + n.taxes.vCofins)}</b></div>
                <div><small>IBS + CBS</small><b>{brl(n.taxes.vIbs + n.taxes.vCbs)}</b></div>
              </div>
    </>
  );
}
