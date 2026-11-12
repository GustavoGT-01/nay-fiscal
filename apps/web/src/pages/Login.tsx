import { useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session';

const ERRS = new Set([3, 6, 10, 13, 17, 22, 26, 29, 34, 38, 41, 45, 49]);

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // barras decorativas: mesma sequencia do mockup (pseudoaleatoria fixa)
  const bars = useMemo(() => Array.from({ length: 52 }, (_, i) => {
    const r = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
    return { h: Math.round(46 + r * 54), e: ERRS.has(i), d: `${(i * 0.022).toFixed(3)}s, ${(1.4 + ((i * 7) % 13) * 0.12).toFixed(2)}s` };
  }), []);

  const fail = (msg: string) => {
    setErr(msg);
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) { fail('Preencha e-mail e senha para continuar.'); return; }
    setBusy(true);
    setErr('');
    try { await login(email.trim(), password); } catch (x) { fail((x as Error).message); } finally { setBusy(false); }
  };

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = panelRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - b.left}px`);
    el.style.setProperty('--my', `${e.clientY - b.top}px`);
  };

  // VITE_DEMO_HINT=1: build de demonstracao (instalador desktop); o hostname local continua obrigatorio
  const demo = (import.meta.env.DEV || import.meta.env.VITE_DEMO_HINT === '1') && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const fill = (em: string) => { if (!busy) { setEmail(em); setPassword('nay12345'); setErr(''); } };
  const badEmail = !!err && !email.trim();
  const badPass = !!err && !password;

  return (
    <div className="nf-root">
      <div className="nf-shell">
        <section className="nf-hero" aria-label="Apresentação">
          <div className="nf-orb a" aria-hidden="true" />
          <div className="nf-orb b" aria-hidden="true" />
          <div className="nf-gridbg" aria-hidden="true" />

          <div className="nf-brand">
            <div className="nf-logo" aria-hidden="true"><span>N</span></div>
            Nay Fiscal
          </div>

          <div>
            <h1 className="nf-h1">
              <span className="nf-line"><span>Notas certas</span></span>
              <span className="nf-line"><span>para a <span className="nf-hl">Reforma</span><span className="nf-dot">.</span></span></span>
            </h1>
            <p className="nf-lead">Importe os XMLs, veja cada erro de IBS, CBS e cClassTrib explicado em português claro e saiba exatamente o que corrigir.</p>
            <div className="nf-chips" aria-hidden="true">
              <span className="nf-chip"><i />IBS</span>
              <span className="nf-chip"><i />CBS</span>
              <span className="nf-chip"><i />cClassTrib</span>
              <span className="nf-chip"><i />XML NF-e</span>
            </div>
            <div className="nf-bars" role="img" aria-label="Ilustração: notas importadas, algumas com erro">
              {bars.map((b, i) => <div key={i} className={b.e ? 'nf-bar nf-bar-err' : 'nf-bar'} style={{ height: `${b.h}%`, animationDelay: b.d }} />)}
            </div>
            <div className="nf-legend" aria-hidden="true">
              <span><b />Notas válidas</span>
              <span><b />Com erro a corrigir</span>
            </div>
          </div>

          <p className="nf-foot">Fase de teste: CBS 0,9% e IBS 0,1% em 2026.</p>
        </section>

        <section className="nf-panel" ref={panelRef} onMouseMove={onMove}>
          <div className="nf-card">
            <form className={shake ? 'nf-form shake' : 'nf-form'} onSubmit={submit} onAnimationEnd={(e) => { if (e.target === e.currentTarget) setShake(false); }} noValidate>
              <h2 className="nf-h2">Entrar</h2>
              <p className="nf-sub">Use o e-mail e a senha que o administrador cadastrou.</p>

              <div className="nf-field">
                <label className="nf-label" htmlFor="nf-email">E-mail</label>
                <div className="nf-wrap">
                  <svg className="nf-ico" strokeWidth={1.8} {...svgProps}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
                  <input id="nf-email" className={badEmail ? 'nf-input bad' : 'nf-input'} type="email" autoComplete="username" placeholder="voce@empresa.com.br" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
                </div>
              </div>

              <div className="nf-field">
                <label className="nf-label" htmlFor="nf-pass">Senha</label>
                <div className="nf-wrap">
                  <svg className="nf-ico" strokeWidth={1.8} {...svgProps}><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                  <input id="nf-pass" className={badPass ? 'nf-input bad' : 'nf-input'} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => { setPassword(e.target.value); setErr(''); }} />
                  <button type="button" className="nf-eye" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow((v) => !v)}>
                    {show ? (
                      <svg strokeWidth={1.8} {...svgProps}><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-3 3.7M6.3 7.6A12.3 12.3 0 0 0 2.5 12c1 2 4.5 6 9.5 6a9.6 9.6 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                    ) : (
                      <svg strokeWidth={1.8} {...svgProps}><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6Z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {err && (
                <p className="nf-err" role="alert">
                  <svg strokeWidth={2} {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
                  {err}
                </p>
              )}

              <button type="submit" className={busy ? 'nf-btn busy' : 'nf-btn'} disabled={busy} aria-live="polite">
                {busy ? (
                  <><span className="nf-spinner" aria-hidden="true" />Entrando…</>
                ) : (
                  <>Entrar<svg className="nf-arrow" strokeWidth={2.2} {...svgProps}><path d="M5 12h14M13 6l6 6-6 6" /></svg></>
                )}
              </button>

              {/* senhas de demonstracao so aparecem na propria maquina, nunca pelo tunel */}
              {demo && (
                <div className="nf-demo">
                  <p className="nf-demo-t"><svg strokeWidth={2} {...svgProps}><path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.2 5.8L12 16l-4.9 3 1.2-5.8L4 9.3l5.6-.7Z" /></svg>Ambiente de demonstração — toque para preencher</p>
                  <button type="button" className="nf-cred" onClick={() => fill('analista@nayfiscal.dev')}>analista@nayfiscal.dev<em>Usar →</em></button>
                  <button type="button" className="nf-cred" onClick={() => fill('admin@nayfiscal.dev')}>admin@nayfiscal.dev<em>Usar →</em></button>
                  <p className="nf-demo-p">Senha: <code>nay12345</code></p>
                </div>
              )}
            </form>
            <p className="nf-foot-sm">Fase de teste: CBS 0,9% e IBS 0,1% em 2026.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
