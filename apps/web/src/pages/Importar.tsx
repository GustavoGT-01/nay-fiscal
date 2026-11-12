import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { UploadDTO } from '@nay/shared';
import { api, fmtCnpj } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/ui';
import { useUploads } from '../hooks/useUploads';

function Job({ u }: { u: UploadDTO }) {
  const done = u.status !== 'PROCESSANDO';
  const pct = u.total ? (u.processed / u.total) * 100 : done ? 100 : 4;
  return (
    <div className={'job' + (u.status === 'CONCLUIDO' ? ' done' : '')}>
      <div className="job-top">
        <span><i className={'ti ' + (u.kind === 'ZIP' ? 'ti-file-zip' : 'ti-file-code')} style={{ color: 'var(--uva)' }} />{u.fileName}</span>
        <span className="hint"><b>{u.processed}</b> de {u.total || '…'}</span>
      </div>
      <div className="track"><div className="fill" style={{ width: pct + '%' }} /></div>
      {!done && <small>Lendo e auditando, você pode continuar usando o sistema.</small>}
      {u.status === 'CONCLUIDO' && (
        <>
          {u.clientName && <small>Cliente: <b>{u.clientName}</b></small>}
          <div className="job-res">
            <span className="tag ok"><i className="ti ti-check" />{u.okCount} conformes</span>
            <span className="tag erro">{u.errorCount} com erro</span>
            {u.createdClients.map((n) => <span key={n} className="tag neutro"><i className="ti ti-building-store" />Cliente novo: {n}</span>)}
            {u.message && <span className="tag atencao">{u.message}</span>}
            <Link className="btn" style={{ padding: '4px 10px', fontSize: 12.5 }} to="/auditoria">Ver auditoria</Link>
          </div>
        </>
      )}
      {u.status === 'ERRO' && <div className="job-res"><span className="tag erro">{u.message ?? 'Não foi possível ler o arquivo.'}</span></div>}
    </div>
  );
}

export function Importar() {
  const { client, clients, can, setClientId } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const canCreate = can('clientes.gerenciar');
  const [over, setOver] = useState(false);
  // "auto" = detectar o cliente pelo CNPJ das notas (e criar se faltar)
  const [target, setTarget] = useState<string>(canCreate ? 'auto' : client?.id ?? '');
  const input = useRef<HTMLInputElement>(null);
  const uploads = useUploads();

  useEffect(() => { if (!canCreate && !target && client) setTarget(client.id); }, [canCreate, target, client]);

  // avisa quando um envio termina
  const prev = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const u of uploads.data ?? []) {
      if (prev.current[u.id] === 'PROCESSANDO' && u.status === 'CONCLUIDO') {
        toast(`${u.fileName}: ${u.okCount + u.errorCount} notas importadas e auditadas`);
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        qc.invalidateQueries({ queryKey: ['clients'] });
        // se ainda nao havia cliente escolhido, passa a trabalhar com o cliente das notas
        if (!client && u.clientName) {
          const c = (qc.getQueryData<{ id: string; name: string }[]>(['clients']) ?? []).find((x) => x.name === u.clientName);
          if (c) setClientId(c.id);
        }
      }
      prev.current[u.id] = u.status;
    }
  }, [uploads.data, toast, qc, client, setClientId]);

  const send = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(xml|zip|txt)$/i.test(f.name));
    if (!list.length) return toast('Envie arquivos XML, ZIP ou SPED (.txt).', 'ti-alert-triangle');
    const big = list.find((f) => f.size > 50 * 1024 * 1024);
    if (big) return toast(`${big.name} passa de 50 MB.`, 'ti-alert-triangle');
    if (!target) return toast('Escolha o cliente das notas.', 'ti-alert-triangle');
    const fd = new FormData();
    fd.append('clientId', target);
    list.forEach((f) => fd.append('file', f));
    try {
      await api('/api/uploads', { method: 'POST', body: fd });
      uploads.refetch();
    } catch (e) {
      toast((e as Error).message, 'ti-alert-triangle');
    }
  };

  return (
    <section className="view on" aria-labelledby="h-imp">
      <h1 id="h-imp">Importar notas</h1>
      <p className="lede">Envie os arquivos e a auditoria roda sozinha. Você pode continuar usando o sistema enquanto isso.</p>
      <div className="two">
        <div className="panel">
          <label
            className={'drop' + (over ? ' over' : '')}
            tabIndex={0}
            onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
            onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          >
            <input ref={input} type="file" multiple accept=".xml,.zip,.txt" hidden onChange={(e) => { if (e.target.files) send(e.target.files); e.target.value = ''; }} />
            <div className="ico"><i className="ti ti-file-upload" /></div>
            <h3>Solte XML, ZIP ou SPED aqui</h3>
            <p>NF-e, NFC-e e CT-e, até 50 MB por arquivo. Eventos de cancelamento também são aceitos.</p>
            <p style={{ marginTop: 12 }}><span className="btn" style={{ pointerEvents: 'none' }}>Escolher arquivos</span></p>
          </label>
          <div className="field">
            <label htmlFor="alvo">Cliente das notas</label>
            <select id="alvo" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {canCreate && <option value="auto">Detectar pelo CNPJ das notas (recomendado)</option>}
              {!canCreate && !clients.length && <option value="">Nenhum cliente cadastrado</option>}
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}, CNPJ {fmtCnpj(c.cnpj)}</option>)}
            </select>
            <p className="hint" style={{ fontSize: 12.5, marginTop: 8 }}>
              {target === 'auto'
                ? 'Cada nota vai para o cliente que aparece nela, como emitente ou destinatário. Se a empresa ainda não está cadastrada, a Nay cria o cliente com os dados da nota. Filiais entram no cliente da matriz.'
                : 'Só entram notas em que este cliente é emitente ou destinatário. As outras são puladas e aparecem no resumo.'}
            </p>
          </div>
        </div>
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Fila de importação</h2>
            <button className="btn" onClick={() => uploads.refetch()}><i className="ti ti-refresh" />Atualizar</button>
          </div>
          <div className="queue">
            {uploads.data?.map((u) => <Job key={u.id} u={u} />)}
            {uploads.data?.length === 0 && <p className="hint">Nenhum envio ainda. Os arquivos que você mandar aparecem aqui com o progresso.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
