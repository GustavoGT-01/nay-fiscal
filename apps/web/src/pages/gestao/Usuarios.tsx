import { useState, type FormEvent } from 'react';
import type { AdminUserDTO } from '@nay/shared';
import { useAdminProfiles, useAdminUsers, useTeamActions } from '../../hooks/useAdmin';
import { ApiError, fmtDate } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/ui';

const ROLE: Record<string, string> = { ADMIN: 'Administrador', OWNER: 'Dono', ANALISTA: 'Analista' };

type Editing = 'new' | AdminUserDTO | null;

/** Usuarios do escritorio: lista e formulario ao lado. So administradores criam e alteram; os demais so leem. */
export function Usuarios() {
  const { user: me } = useSession();
  const toast = useToast();
  const users = useAdminUsers();
  const profiles = useAdminProfiles();
  const { createUser, updateUser } = useTeamActions();
  const canEdit = me?.role !== 'ANALISTA';
  const [editing, setEditing] = useState<Editing>(null);

  const open = (e: Editing) => { createUser.reset(); updateUser.reset(); setEditing(e); };
  const busy = createUser.isPending || updateUser.isPending;
  const error = createUser.error ?? updateUser.error;

  return (
    <div className={editing ? 'two' : undefined} style={editing ? { marginTop: 0 } : undefined}>
      <div>
        {canEdit && (
          <div className="toolbar" style={{ marginTop: 0 }}>
            <button className="btn primary" onClick={() => open('new')}><i className="ti ti-user-plus" />Novo usuário</button>
          </div>
        )}
        <div className="table-wrap">
          <table className="table static">
            <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col" className="r">Desde</th>{canEdit && <th scope="col" aria-label="Ações" />}</tr></thead>
            <tbody>
              {users.isPending && <tr><td colSpan={6}><div className="skel" style={{ height: 18 }} /></td></tr>}
              {users.isError && <tr><td colSpan={6} className="hint">Não foi possível carregar os usuários.</td></tr>}
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === me?.id && <span className="hint"> · você</span>}</td>
                  <td className="mono">{u.email}</td>
                  <td>{u.role === 'ANALISTA' ? u.profile ?? 'Sem perfil' : `${ROLE[u.role] ?? u.role} (acesso total)`}</td>
                  <td>
                    {u.active ? <span className="tag ok"><i className="ti ti-check" />Ativo</span> : <span className="tag neutro">Desativado</span>}
                    {u.active && u.mustChangePassword && <span className="tag atencao" style={{ marginLeft: 6 }} title="Ainda não trocou a senha definida pelo administrador">Senha provisória</span>}
                  </td>
                  <td className="r">{fmtDate(u.createdAt)}</td>
                  {canEdit && <td className="r"><button className="btn" onClick={() => open(u)} aria-label={`Editar ${u.name}`}><i className="ti ti-pencil" />Editar</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canEdit && <p className="hint" style={{ marginTop: 12 }}>Só administradores do escritório criam ou alteram usuários.</p>}
      </div>

      {editing && (
        <UserForm
          key={editing === 'new' ? 'new' : editing.id}
          target={editing}
          self={editing !== 'new' && editing.id === me?.id}
          profiles={profiles.data ?? []}
          busy={busy}
          error={error instanceof ApiError ? error.message : error ? 'Não foi possível salvar. Tente de novo.' : ''}
          onCancel={() => open(null)}
          onSave={async (b) => {
            if (editing === 'new') await createUser.mutateAsync({ name: b.name, email: b.email, password: b.password, role: b.role, profileId: b.role === 'ANALISTA' ? b.profileId : null });
            else await updateUser.mutateAsync({ id: editing.id, name: b.name, role: b.role, profileId: b.role === 'ANALISTA' ? b.profileId : null, active: b.active, ...(b.password ? { password: b.password } : {}) });
            toast(editing === 'new' ? 'Usuário criado' : 'Usuário atualizado', 'ti-user-check');
            open(null);
          }}
        />
      )}
    </div>
  );
}

interface FormValues { name: string; email: string; password: string; role: 'ADMIN' | 'ANALISTA'; profileId: string | null; active: boolean }

function UserForm({ target, self, profiles, busy, error, onSave, onCancel }: {
  target: AdminUserDTO | 'new'; self: boolean; profiles: { id: string; name: string }[]; busy: boolean; error: string;
  onSave: (v: FormValues) => Promise<void>; onCancel: () => void;
}) {
  const isNew = target === 'new';
  const owner = !isNew && target.role === 'OWNER';
  const [v, setV] = useState<FormValues>(() => isNew
    ? { name: '', email: '', password: '', role: 'ANALISTA', profileId: profiles[0]?.id ?? null, active: true }
    : { name: target.name, email: target.email, password: '', role: target.role === 'ADMIN' || target.role === 'OWNER' ? 'ADMIN' : 'ANALISTA', profileId: target.profileId, active: target.active });
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(v).catch(() => { /* o erro vem de `error` */ }); };

  return (
    <form className="panel" onSubmit={submit} aria-labelledby="h-user">
      <h2 id="h-user">{isNew ? 'Novo usuário' : `Editar usuário: ${target.name}`}</h2>
      <div className="field"><label htmlFor="u-nome">Nome</label><div className="input"><input id="u-nome" value={v.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} /></div></div>
      <div className="field"><label htmlFor="u-email">E-mail</label><div className="input"><input id="u-email" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} required readOnly={!isNew} disabled={!isNew} /></div></div>
      <div className="field">
        <label htmlFor="u-papel">Papel</label>
        <select id="u-papel" className="select" value={v.role} onChange={(e) => set('role', e.target.value as FormValues['role'])} disabled={self || owner}>
          <option value="ANALISTA">Analista (acesso pelo perfil)</option>
          <option value="ADMIN">Administrador (acesso total)</option>
        </select>
        {(self || owner) && <p className="hint" style={{ marginTop: 6 }}>{owner ? 'A conta do dono não muda de papel.' : 'Você não pode mudar o papel da própria conta.'}</p>}
      </div>
      {v.role === 'ANALISTA' && !owner && (
        <div className="field">
          <label htmlFor="u-perfil">Perfil</label>
          <select id="u-perfil" className="select" value={v.profileId ?? ''} onChange={(e) => set('profileId', e.target.value || null)} required>
            <option value="" disabled>Escolha um perfil</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!profiles.length && <p className="hint" style={{ marginTop: 6 }}>Crie um perfil na aba Perfis antes de cadastrar analistas.</p>}
        </div>
      )}
      {!self && (
        <div className="field">
          <label htmlFor="u-senha">{isNew ? 'Senha inicial' : 'Nova senha (deixe vazio para manter)'}</label>
          <div className="input"><input id="u-senha" type="password" autoComplete="new-password" value={v.password} onChange={(e) => set('password', e.target.value)} required={isNew} placeholder="10+ caracteres, letras e números" /></div>
          <p className="hint" style={{ marginTop: 6 }}>A pessoa troca essa senha no primeiro acesso.</p>
        </div>
      )}
      {!isNew && (
        <label className="perm" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} disabled={self || owner} />Conta ativa
        </label>
      )}
      {error && <p className="err-box" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      <p style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={busy || !v.name.trim() || (isNew && (!v.email || !v.password)) || (v.role === 'ANALISTA' && !v.profileId && !owner)}>{busy ? 'Salvando…' : isNew ? 'Criar usuário' : 'Salvar'}</button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      </p>
    </form>
  );
}
