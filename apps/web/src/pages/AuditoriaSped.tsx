import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SpedFileDTO, SpedKind } from '@nay/shared';
import { useSession } from '../lib/session';
import { EmptyState, QueryError, Seg } from '../lib/ui';
import { useOpenNote } from '../components/note-drawer';
import { Pager, rowProps } from '../lib/widgets';
import { SPED_PER_PAGE, useSpedDetail, useSpedFiles } from '../hooks/useSped';

type Filter = SpedKind | '';

const KIND: Record<SpedKind, { label: string; cls: string }> = {
  valor: { label: 'Valor', cls: 'erro' },
  icms: { label: 'ICMS', cls: 'erro' },
  sem_xml: { label: 'Sem XML importado', cls: 'atencao' },
  fora_do_sped: { label: 'Fora do SPED', cls: 'atencao' },
  situacao: { label: 'Situação', cls: 'neutro' },
  operacao: { label: 'Operação', cls: 'neutro' },
};
const KPI: { kind: SpedKind; label: string; cls: string }[] = [
  { kind: 'valor', label: 'valor diferente', cls: 'bad' },
  { kind: 'icms', label: 'ICMS diferente', cls: 'bad' },
  { kind: 'sem_xml', label: 'nota sem XML importado', cls: 'warn' },
  { kind: 'fora_do_sped', label: 'XML fora do SPED', cls: 'warn' },
  { kind: 'situacao', label: 'situação diferente', cls: '' },
  { kind: 'operacao', label: 'operação diferente', cls: '' },
];

/** Mes e ano do periodo do arquivo (as datas do SPED sao dias, sem hora: le em UTC para nao voltar um dia). */
const mes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const mesCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' de ', '/').replace('.', '');
const nomeArquivo = (f: SpedFileDTO) => `${f.fileName} · ${mesCurto(f.periodStart)}`;

/** Aba SPED da Auditoria: o arquivo comparado com as notas importadas. So leitura. */
export function AuditoriaSped() {
  const { client } = useSession();
  const nav = useNavigate();
  const openNote = useOpenNote();
  const files = useSpedFiles(client?.id, true);
  const [fileId, setFileId] = useState('');
  const [kind, setKind] = useState<Filter>('');
  const [page, setPage] = useState(0);

  const list = files.data ?? [];
  const current = list.find((f) => f.id === fileId) ?? list[0];
  // trocou de cliente: volta ao arquivo mais recente
  useEffect(() => { setFileId(''); setKind(''); setPage(0); }, [client?.id]);
  const detail = useSpedDetail(current?.id, kind, page);

  if (files.isLoading) return <div className="skel" style={{ height: 240 }} />;
  if (files.isError) return <QueryError error={files.error} onRetry={() => files.refetch()} what="os arquivos de SPED" />;
  if (!current) {
    return <EmptyState icon="ti-file-text" title="Nenhum SPED importado" text="Envie o arquivo .txt do SPED Fiscal na tela Importar. Ele é comparado com as notas já importadas, só leitura." action={<button className="btn primary" onClick={() => nav('/importar')}><i className="ti ti-cloud-upload" />Ir para Importar</button>} />;
  }

  const d = detail.data;
  const kinds = d?.kinds ?? {};
  const total = d?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SPED_PER_PAGE));
  const options: { value: Filter; label: string }[] = [
    { value: '', label: 'Todas' },
    ...(Object.keys(KIND) as SpedKind[]).filter((k) => (kinds[k] ?? 0) > 0 || k === kind).map((k) => ({ value: k, label: k === 'sem_xml' ? 'Sem XML' : KIND[k].label })),
  ];

  return (
    <div>
      <p className="lede" style={{ marginBottom: 4 }}>
        O arquivo de <b>{mes(current.periodStart)}</b> foi comparado com as notas já importadas de <span className="cname">{client?.name}</span>. Só leitura: nada é alterado nas notas.
      </p>
      <div className="kpis">
        <div className="kpi"><strong>{current.entries.toLocaleString('pt-BR')}</strong><small>notas no arquivo</small></div>
        {KPI.filter((k) => (kinds[k.kind] ?? 0) > 0 || ['valor', 'sem_xml', 'fora_do_sped', 'situacao'].includes(k.kind)).map((k) => (
          <div key={k.kind} className={'kpi ' + ((kinds[k.kind] ?? 0) > 0 ? k.cls : '')}><strong>{(kinds[k.kind] ?? 0).toLocaleString('pt-BR')}</strong><small>{k.label}</small></div>
        ))}
      </div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <Seg<Filter> label="Tipo de divergência" value={kind} onChange={(v) => { setKind(v); setPage(0); }} options={options} />
        <select className="select" style={{ width: 'auto', marginLeft: 'auto', paddingRight: 40 }} aria-label="Arquivo" value={current.id} onChange={(e) => { setFileId(e.target.value); setKind(''); setPage(0); }}>
          {list.map((f) => <option key={f.id} value={f.id}>{nomeArquivo(f)}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        {detail.isLoading ? <div className="skel" style={{ height: 200, margin: 16 }} /> : detail.isError ? <QueryError error={detail.error} onRetry={() => detail.refetch()} what="as divergências" /> : (
          <table className="table">
            <thead><tr><th scope="col">Nota</th><th scope="col">Divergência</th><th scope="col">No SPED</th><th scope="col">No XML</th></tr></thead>
            <tbody>
              {d?.rows.map((r) => (
                <tr key={r.id} {...(r.documentId ? rowProps(() => openNote(r.documentId!)) : { style: { cursor: 'default' } })}>
                  <td className="mono">{r.number || r.key.slice(25, 34)}</td>
                  <td><span className={'tag ' + KIND[r.kind].cls}>{KIND[r.kind].label}</span></td>
                  <td>{r.sped}</td>
                  <td>{r.xml}</td>
                </tr>
              ))}
              {d && !d.rows.length && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>{current.divergenceCount ? 'Nenhuma divergência deste tipo.' : 'O SPED confere com as notas importadas.'}</td></tr>}
            </tbody>
          </table>
        )}
        <Pager summary={`${total} ${total === 1 ? 'divergência' : 'divergências'}`} page={page} pages={pages} onPage={setPage} />
      </div>
      {d?.truncated && <p className="hint" style={{ marginTop: 12 }}>O arquivo tem {current.divergenceCount.toLocaleString('pt-BR')} divergências; só as primeiras são guardadas e mostradas aqui.</p>}
      <p className="hint" style={{ marginTop: 12 }}>Clique numa linha para abrir a nota. Notas emitidas fora do período do arquivo não entram como "fora do SPED": confira se foram escrituradas em outro mês.</p>
    </div>
  );
}
