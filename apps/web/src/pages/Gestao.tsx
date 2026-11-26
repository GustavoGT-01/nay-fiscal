import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AdminClientSummaryDTO, WipeResultDTO } from '@nay/shared';
import { useAdminSummary } from '../hooks/useAdmin';
import { api, ApiError, fmtCnpj } from '../lib/api';
import { useSession } from '../lib/session';
import { Seg, useToast } from '../lib/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { refreshData } from '../lib/queries';
import { Usuarios } from './gestao/Usuarios';
import { Perfis } from './gestao/Perfis';

type Tab = 'usuarios' | 'perfis' | 'dados';
const notas = (n: number) => (n === 1 ? '1 nota' : `${n.toLocaleString('pt-BR')} notas`);

type Pending = { kind: 'client'; client: AdminClientSummaryDTO } | { kind: 'office'; total: number } | null;

export function Gestao() {
  const { can, user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const canWipe = can('dados.apagar');
  const [tab, setTab] = useState<Tab>('usuarios');
  const summary = useAdminSummary(canWipe);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const rows = summary.data ?? [];
  const total = rows.reduce((s, c) => s + c.notes, 0);
  const close = useCallback(() => { if (!busy) setPending(null); }, [busy]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = pending.kind === 'client'
        ? await api<WipeResultDTO>(`/api/clients/${pending.client.id}/documents`, { method: 'DELETE' })
        : await api<WipeResultDTO>('/api/data/documents', { method: 'DELETE', body: JSON.stringify({ confirm: 'APAGAR' }) });
      toast(`${notas(r.documents)} ${r.documents === 1 ? 'apagada' : 'apagadas'}`, 'ti-trash');
      setPending(null);
      await refreshData(qc);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Não foi possível apagar. Tente de novo.', 'ti-alert-triangle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view on" aria-labelledby="h-gest">
      <h1 id="h-gest">Gestão</h1>
      <p className="lede">Usuários, perfis de acesso e dados guardados do escritório {user?.officeName}.</p>

      <div className="toolbar">
        <Seg<Tab> label="Seção" value={tab} onChange={setTab} options={[{ value: 'usuarios', label: 'Usuários' }, { value: 'perfis', label: 'Perfis' }, ...(canWipe ? [{ value: 'dados' as Tab, label: 'Dados' }] : [])]} />
      </div>

      {tab === 'usuarios' && <Usuarios />}
      {tab === 'perfis' && <Perfis />}

      {canWipe && tab === 'dados' && (
        <div className="gestao-sec">
          <h2>Dados</h2>
          <p className="hint">Apagar remove notas, itens, achados, envios e auditorias. Clientes, usuários e regras ficam.</p>
          <div className="table-wrap">
            <table className="table static">
              <thead><tr><th scope="col">Cliente</th><th scope="col">CNPJ</th><th scope="col" className="r">Notas</th><th scope="col" className="r">Envios</th><th scope="col" className="r">Ação</th></tr></thead>
              <tbody>
                {summary.isPending && <tr><td colSpan={5}><div className="skel" style={{ height: 18 }} /></td></tr>}
                {summary.isError && <tr><td colSpan={5} className="hint">Não foi possível carregar os dados.</td></tr>}
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td className="mono">{fmtCnpj(c.cnpj)}</td>
                    <td className="r">{c.notes.toLocaleString('pt-BR')}</td>
                    <td className="r">{c.uploads.toLocaleString('pt-BR')}</td>
                    <td className="r">
                      <button className="btn danger-ghost" disabled={!c.notes && !c.uploads} onClick={() => setPending({ kind: 'client', client: c })}>
                        <i className="ti ti-trash" />Apagar notas do cliente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel danger-zone" style={{ marginTop: 16 }}>
            <div>
              <h3>Apagar todas as notas do escritório</h3>
              <p className="hint">{notas(total)} de {rows.length} clientes. Não dá para desfazer.</p>
            </div>
            <button className="btn danger" disabled={!total} onClick={() => setPending({ kind: 'office', total })}>
              <i className="ti ti-trash" />Apagar tudo
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        busy={busy}
        typeToConfirm="APAGAR"
        title={pending?.kind === 'office' ? 'Apagar todas as notas?' : `Apagar as notas de ${pending?.kind === 'client' ? pending.client.name : ''}?`}
        text={pending?.kind === 'office'
          ? `${notas(pending.total)} de todos os clientes do escritório. Não dá para desfazer.`
          : pending?.kind === 'client' ? `${notas(pending.client.notes)} e ${pending.client.uploads} envios. Não dá para desfazer.` : ''}
        confirmLabel={pending?.kind === 'office' ? 'Apagar tudo' : 'Apagar notas'}
        onConfirm={confirm}
        onCancel={close}
      />
    </section>
  );
}
