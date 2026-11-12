import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SCREENS } from '@nay/shared';
import { initials } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/ui';
import { useDashboard } from '../hooks/useDashboard';
import { useNotifications } from '../hooks/useNotifications';
import { CommandPalette } from './CommandPalette';

export function Shell() {
  const { user, client, clients, setClientId, can, logout } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');
  const toast = useToast();
  const loc = useLocation();
  const nav = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const dash = useDashboard(client?.id, { enabled: can('inicio') });
  const notifs = useNotifications();

  useEffect(() => { setSideOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [loc.pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenuOpen(false); setUserOpen(false); } };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(true); }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', key); };
  }, []);

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('nay.theme', t); } catch { /* ignora */ }
    setTheme(t);
  };

  const screens = useMemo(() => SCREENS.filter((s) => can(s.key)), [can]);
  const errCount = dash.data?.totals.erro ?? 0;
  const unread = (notifs.data ?? []).filter((n) => !n.readAt);

  return (
    <div className="app">
      <nav className={'side' + (sideOpen ? ' open' : '')} aria-label="Menu principal">
        <div className="brand"><div className="brand-mark"><span>N</span></div><b>Nay Fiscal</b></div>
        {screens.filter((s) => s.group === 'main').map((s) => (
          <NavLink key={s.key} to={s.path} end={s.path === '/'} className="nav-btn">
            <i className={'ti ti-' + s.icon} />{s.label}
            {s.key === 'auditoria' && errCount > 0 && <span className="pill">{errCount}</span>}
          </NavLink>
        ))}
        <div className="sep" />
        {screens.filter((s) => s.group === 'support').map((s) => (
          <NavLink key={s.key} to={s.path} className="nav-btn"><i className={'ti ti-' + s.icon} />{s.label}</NavLink>
        ))}
        <div className="side-foot"><b>Fase de teste da Reforma</b>Grupo IBS/CBS obrigatório nas NF-e emitidas desde 03/08/2026.</div>
      </nav>

      <main className="main">
        <header className="top" ref={menuRef}>
          <button className="icon-btn burger" aria-label="Abrir menu" onClick={(e) => { e.stopPropagation(); setSideOpen((x) => !x); }}><i className="ti ti-menu-2" /></button>
          <div style={{ position: 'relative' }}>
            <button className="client" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((x) => !x)}>
              <span className="av">{client ? initials(client.name) : '—'}</span>
              <span><small>Cliente</small><strong>{client?.name ?? 'Nenhum cliente'}</strong></span>
              <i className="ti ti-selector" style={{ color: 'var(--muted)' }} />
            </button>
            <div className={'menu' + (menuOpen ? ' open' : '')} role="menu">
              {clients.map((c) => (
                <button key={c.id} role="menuitem" onClick={() => { setClientId(c.id); setMenuOpen(false); toast('Trabalhando agora com ' + c.name, 'ti-building-store'); }}>
                  <span>{c.name}</span><span>{c.conformity === null ? 'sem notas' : `${c.conformity}% conforme`}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="search" onClick={() => setCmdOpen(true)}><i className="ti ti-search" /><span>Buscar nota, regra ou tela</span><kbd>Ctrl K</kbd></button>
          <button className="icon-btn" aria-label="Alternar tema" onClick={toggleTheme}><i className={'ti ' + (theme === 'dark' ? 'ti-sun' : 'ti-moon')} /></button>
          <button className="icon-btn" id="bellBtn" aria-label="Notificações" onClick={() => toast(unread[0]?.message ?? 'Nenhuma notificação nova', 'ti-bell')}>
            <i className="ti ti-bell" />{unread.length > 0 && <span className="dot" />}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="me" style={{ border: 0, cursor: 'pointer' }} aria-label={user?.name} onClick={() => setUserOpen((x) => !x)}>{user ? initials(user.name) || user.name.slice(0, 2).toUpperCase() : ''}</button>
            <div className={'menu' + (userOpen ? ' open' : '')} role="menu" style={{ left: 'auto', right: 0 }}>
              <button role="menuitem" disabled style={{ cursor: 'default' }}><span>{user?.name}</span><span>{user?.role === 'ANALISTA' ? 'Analista' : 'Administrador'}</span></button>
              <button role="menuitem" onClick={() => nav('/ajuda')}><span>Ajuda</span><span /></button>
              <button role="menuitem" onClick={logout}><span>Sair</span><span /></button>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Navegação">
        {screens.filter((x) => ['inicio', 'notas', 'importar', 'auditoria'].includes(x.key)).map((x) => (
          <NavLink key={x.key} to={x.path} end={x.path === '/'} className="tab">
            <i className={'ti ti-' + x.icon} />{x.label}
            {x.key === 'auditoria' && errCount > 0 && <span className="pill">{errCount}</span>}
          </NavLink>
        ))}
        <button type="button" className="tab" onClick={(e) => { e.stopPropagation(); setSideOpen(true); }}><i className="ti ti-menu-2" />Mais</button>
      </nav>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
