import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/ui';

/** Mesma regra do servidor (services/password.ts); la ela vale de verdade, aqui so avisa antes de enviar. */
const problema = (p: string) => (p.length < 10 || !/[a-zA-Z]/.test(p) || !/\d/.test(p) ? 'A senha precisa ter pelo menos 10 caracteres, com letras e números.' : null);

/**
 * Troca de senha. `forced`: primeiro acesso depois de o administrador definir a senha, antes de usar o sistema.
 * Sem `forced`: tela aberta pelo menu do usuario.
 */
export function TrocarSenha({ forced = false }: { forced?: boolean }) {
  const { changePassword, logout, user } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bad = problema(next) ?? (next !== again ? 'A confirmação não é igual à nova senha.' : null);
    if (bad) return setError(bad);
    setBusy(true);
    setError('');
    try {
      await changePassword(current, next);
      toast('Senha trocada', 'ti-lock-check');
      if (!forced) nav('/');
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="panel" onSubmit={submit} style={{ width: 'min(440px, 100%)' }} aria-labelledby="h-senha">
      <h1 id="h-senha" style={{ fontSize: 22 }}>{forced ? 'Defina a sua senha' : 'Trocar senha'}</h1>
      <p className="hint" style={{ marginTop: 6 }}>
        {forced ? `Olá, ${user?.name ?? ''}. A senha que o administrador definiu vale só para o primeiro acesso. ` : ''}
        Use pelo menos 10 caracteres, com letras e números. As outras sessões abertas serão encerradas.
      </p>
      <div className="field"><label htmlFor="s-atual">{forced ? 'Senha recebida do administrador' : 'Senha atual'}</label><div className="input"><input id="s-atual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div></div>
      <div className="field"><label htmlFor="s-nova">Nova senha</label><div className="input"><input id="s-nova" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></div></div>
      <div className="field"><label htmlFor="s-conf">Repita a nova senha</label><div className="input"><input id="s-conf" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></div></div>
      {error && <p className="err-box" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      <p style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={busy || !current || !next || !again}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
        {forced ? <button className="btn" type="button" onClick={logout}>Sair</button> : <button className="btn" type="button" onClick={() => nav(-1)}>Cancelar</button>}
      </p>
    </form>
  );

  if (!forced) return <section className="view on">{form}</section>;
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>{form}</div>;
}
