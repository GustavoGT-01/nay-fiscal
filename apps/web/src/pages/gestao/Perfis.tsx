import { useState, type FormEvent } from 'react';
import { ACTIONS, SCREENS, type AdminProfileDTO } from '@nay/shared';
import { useAdminProfiles, useTeamActions } from '../../hooks/useAdmin';
import { ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/** Telas e acoes que um perfil pode liberar, na ordem do menu. */
const OPCOES: { key: string; label: string }[] = [
  ...SCREENS.map((s) => ({ key: s.key, label: s.label })),
  ...ACTIONS.map((a) => ({ key: a.key, label: a.label })),
];
const nomeDe = (key: string) => OPCOES.find((o) => o.key === key)?.label ?? key;

type Editing = 'new' | AdminProfileDTO | null;

/** Perfis de acesso: o que cada analista enxerga. So administradores criam e alteram. */
export function Perfis() {
  const { user: me } = useSession();
  const toast = useToast();
  const profiles = useAdminProfiles();
  const { createProfile, updateProfile, deleteProfile } = useTeamActions();
  const canEdit = me?.role !== 'ANALISTA';
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<AdminProfileDTO | null>(null);

  const open = (e: Editing) => { createProfile.reset(); updateProfile.reset(); setEditing(e); };
  const busy = createProfile.isPending || updateProfile.isPending;
  const err = (e: unknown) => (e instanceof ApiError ? e.message : e ? 'Não foi possível salvar. Tente de novo.' : '');
  const error = err(createProfile.error ?? updateProfile.error);

  const remove = async () => {
    if (!removing) return;
    try {
      await deleteProfile.mutateAsync(removing.id);
      toast('Perfil apagado', 'ti-trash');
      if (editing !== 'new' && editing?.id === removing.id) setEditing(null);
    } catch (e) {
      toast(err(e), 'ti-alert-triangle');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className={editing ? 'two' : undefined} style={editing ? { marginTop: 0 } : undefined}>
      <div>
        {canEdit && <div className="toolbar" style={{ marginTop: 0 }}><button className="btn primary" onClick={() => open('new')}><i className="ti ti-plus" />Novo perfil</button></div>}
        <div className="table-wrap">
          <table className="table static">
            <thead><tr><th>Perfil</th><th>Libera</th><th className="r">Usuários</th>{canEdit && <th aria-label="Ações" />}</tr></thead>
            <tbody>
              {profiles.isPending && <tr><td colSpan={4}><div className="skel" style={{ height: 18 }} /></td></tr>}
              {profiles.isError && <tr><td colSpan={4} className="hint">Não foi possível carregar os perfis.</td></tr>}
              {profiles.data?.length === 0 && <tr><td colSpan={4} className="hint" style={{ padding: 24, textAlign: 'center' }}>Nenhum perfil ainda. Crie um para cadastrar analistas.</td></tr>}
              {profiles.data?.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td className="hint">{p.permissions.length ? p.permissions.slice(0, 4).map(nomeDe).join(', ') + (p.permissions.length > 4 ? ` e mais ${p.permissions.length - 4}` : '') : 'Nada liberado'}</td>
                  <td className="r">{p.users}</td>
                  {canEdit && <td className="r"><button className="btn" onClick={() => open(p)} aria-label={`Editar o perfil ${p.name}`}><i className="ti ti-pencil" />Editar</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canEdit && <p className="hint" style={{ marginTop: 12 }}>Só administradores do escritório criam ou alteram perfis.</p>}
      </div>

      {editing && (
        <ProfileForm
          key={editing === 'new' ? 'new' : editing.id}
          target={editing}
          busy={busy}
          error={error}
          onCancel={() => open(null)}
          onDelete={editing === 'new' ? undefined : () => setRemoving(editing)}
          onSave={async (b) => {
            if (editing === 'new') await createProfile.mutateAsync(b);
            else await updateProfile.mutateAsync({ id: editing.id, ...b });
            toast(editing === 'new' ? 'Perfil criado' : 'Perfil salvo', 'ti-shield-check');
            open(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        busy={deleteProfile.isPending}
        title={`Apagar o perfil ${removing?.name ?? ''}?`}
        text={removing && removing.users > 0 ? `Há ${removing.users} usuário(s) com este perfil. Troque o perfil deles antes de apagar.` : 'Não dá para desfazer.'}
        confirmLabel="Apagar perfil"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function ProfileForm({ target, busy, error, onSave, onCancel, onDelete }: {
  target: AdminProfileDTO | 'new'; busy: boolean; error: string;
  onSave: (v: { name: string; permissions: string[] }) => Promise<void>; onCancel: () => void; onDelete?: () => void;
}) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name);
  const [perms, setPerms] = useState<Set<string>>(new Set(isNew ? ['inicio', 'ajuda'] : target.permissions));
  const toggle = (k: string) => setPerms((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const submit = (e: FormEvent) => { e.preventDefault(); onSave({ name: name.trim(), permissions: OPCOES.filter((o) => perms.has(o.key)).map((o) => o.key) }).catch(() => { /* o erro vem de `error` */ }); };

  return (
    <form className="panel" onSubmit={submit} aria-labelledby="h-perfil">
      <h2 id="h-perfil">{isNew ? 'Novo perfil' : `Editar perfil: ${target.name}`}</h2>
      <div className="field"><label htmlFor="p-nome">Nome do perfil</label><div className="input"><input id="p-nome" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></div></div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="hint" style={{ marginTop: 16 }}>O que este perfil pode usar</legend>
        <div className="perm-grid">
          {OPCOES.map((o) => (
            <label key={o.key} className="perm"><input type="checkbox" checked={perms.has(o.key)} onChange={() => toggle(o.key)} />{o.label}</label>
          ))}
        </div>
      </fieldset>
      {error && <p className="err-box" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      <p style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Salvando…' : 'Salvar perfil'}</button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
        {onDelete && <button className="btn danger-ghost" type="button" onClick={onDelete} disabled={busy} style={{ marginLeft: 'auto' }}><i className="ti ti-trash" />Apagar perfil</button>}
      </p>
    </form>
  );
}
