import { useState } from 'react';
import { useSession } from '../lib/session';

export function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr('Informe e-mail e senha.'); return; }
    setBusy(true);
    setErr('');
    try { await login(email.trim(), password); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const bars = Array.from({ length: 64 }, (_, i) => ({ h: 55 + ((i * 37) % 45), e: i % 7 === 3 || i % 11 === 5 }));

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand"><div className="brand-mark"><span>N</span></div><b>Nay Fiscal</b></div>
        <div>
          <h1>Notas certas para a Reforma.</h1>
          <p>Importe os XMLs, veja cada erro de IBS, CBS e cClassTrib explicado em português claro e saiba exatamente o que corrigir.</p>
          <div className="bars" aria-hidden="true">{bars.map((b, i) => <span key={i} className={b.e ? 'e' : ''} style={{ height: b.h + '%' }} />)}</div>
        </div>
        <small style={{ color: '#A69CC2' }}>Fase de teste: CBS 0,9% e IBS 0,1% em 2026.</small>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h2>Entrar</h2>
          <p className="hint">Use o e-mail e a senha que o administrador cadastrou.</p>
          <label htmlFor="em">E-mail</label>
          <input id="em" className="tf" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="voce@escritorio.com.br" />
          <label htmlFor="pw">Senha</label>
          <input id="pw" className="tf" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErr(''); }} />
          {err && <p className="err-msg" role="alert">{err}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          {/* senhas de demonstracao so aparecem na propria maquina, nunca pelo tunel */}
          {import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) && (
            <div className="demo-hint">Ambiente de demonstração: <code>analista@nayfiscal.dev</code> ou <code>admin@nayfiscal.dev</code>, senha <code>nay12345</code>.</div>
          )}
        </form>
      </div>
    </div>
  );
}
