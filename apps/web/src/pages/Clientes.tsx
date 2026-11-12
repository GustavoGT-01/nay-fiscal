import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { regimeLabel, type ClientDTO } from '@nay/shared';
import { useSession } from '../lib/session';
import { EmptyState, Ring, ringColor, useToast } from '../lib/ui';
import { api, fmtCnpj, initials } from '../lib/api';
import { ClientForm } from '../components/ClientForm';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Clientes() {
  const { clients, setClientId, can } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; client: ClientDTO | null }>({ open: false, client: null });
  const [del, setDel] = useState<ClientDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = can('clientes.gerenciar');
  const canDelete = can('dados.apagar');

  const pick = (c: ClientDTO) => { setClientId(c.id); toast('Trabalhando agora com ' + c.name, 'ti-building-store'); nav('/'); };
  const closeForm = useCallback(() => setForm({ open: false, client: null }), []);

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const r = await api<{ notes: number }>(`/api/clients/${del.id}`, { method: 'DELETE', body: JSON.stringify({ confirm: 'APAGAR' }) });
      toast(`${del.name} excluído, com ${r.notes} nota(s)`, 'ti-trash');
      setDel(null);
      await qc.invalidateQueries();
    } catch (e) {
      toast((e as Error).message, 'ti-alert-triangle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view on" aria-labelledby="h-cli">
      <div className="hello">
        <div>
          <h1 id="h-cli">Clientes</h1>
          <p className="lede">Escolha um cliente para trabalhar. A conformidade mostra a parcela de notas sem erro.</p>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setForm({ open: true, client: null })}><i className="ti ti-plus" />Novo cliente</button>}
      </div>

      {clients.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="ti-building-store"
            title="Cadastre seu primeiro cliente"
            text="Cadastre pelo CNPJ ou importe os XMLs: a Nay Fiscal reconhece a empresa nas notas e cria o cliente sozinha."
            action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {canEdit && <button className="btn primary" onClick={() => setForm({ open: true, client: null })}><i className="ti ti-plus" />Novo cliente</button>}
              <button className="btn" onClick={() => nav('/importar')}><i className="ti ti-cloud-upload" />Importar notas</button>
            </div>}
          />
        </div>
      ) : (
        <div className="clients">
          {clients.map((c) => (
            <div key={c.id} className="ccard" role="button" tabIndex={0} onClick={() => pick(c)} onKeyDown={(e) => e.key === 'Enter' && pick(c)} aria-label={`Trabalhar com ${c.name}`}>
              <div className="top2">
                <span className="av" style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--uva-soft)', color: 'var(--uva)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>{initials(c.name)}</span>
                {c.conformity === null ? <Ring pct={0} color="var(--line)" /> : <Ring pct={c.conformity} color={ringColor(c.conformity)} />}
              </div>
              <h3>{c.name}</h3>
              <p>CNPJ {fmtCnpj(c.cnpj)}</p>
              <p>{regimeLabel(c.regime)}{c.city ? ` · ${c.city}${c.uf ? '/' + c.uf : ''}` : ''}{c.establishments.length > 1 ? ` · ${c.establishments.length} estabelecimentos` : ''}</p>
              <p>{c.conformity === null ? 'Sem notas ainda' : `${c.totalNotes} notas, ${c.conformity}% em conformidade`}</p>
              {(canEdit || canDelete) && (
                <div className="ccard-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {canEdit && <button className="btn" onClick={() => setForm({ open: true, client: c })}><i className="ti ti-pencil" />Editar</button>}
                  {canDelete && <button className="btn danger-ghost" onClick={() => setDel(c)}><i className="ti ti-trash" />Excluir</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ClientForm
        open={form.open}
        client={form.client}
        onClose={closeForm}
        onSaved={(id, name) => {
          const isNew = !form.client;
          closeForm();
          qc.invalidateQueries();
          toast(isNew ? `${name} cadastrado` : 'Cliente atualizado', 'ti-circle-check');
          if (isNew && id) setClientId(id);
        }}
      />
      <ConfirmDialog
        open={!!del}
        busy={busy}
        title="Excluir cliente"
        text={del ? <>Excluir <b>{del.name}</b> e {del.totalNotes === 1 ? 'a nota importada' : `as ${del.totalNotes} notas importadas`}? Não dá para desfazer.</> : ''}
        typeToConfirm="APAGAR"
        confirmLabel="Excluir cliente"
        onConfirm={remove}
        onCancel={() => !busy && setDel(null)}
      />
    </section>
  );
}
