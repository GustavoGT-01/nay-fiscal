import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/icons.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/common.css';

import './styles/importar.css';
import './styles/notas.css';
import './styles/auditoria.css';
import './styles/drawer.css';
import './styles/simulador.css';
import './styles/clientes-ia.css';
import './styles/overlays.css';
import './styles/responsive.css';
import './styles/extras.css';
import './styles/telas.css';
import './styles/login.css';
import { SessionProvider, useSession } from './lib/session';
import { EmptyState, ToastProvider } from './lib/ui';
import { NoteDrawerProvider } from './components/note-drawer';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';

// Inicio e Login abrem junto com o app; as outras telas sao baixadas quando a pessoa entra nelas.
const Notas = lazy(() => import('./pages/Notas').then((m) => ({ default: m.Notas })));
const Auditoria = lazy(() => import('./pages/Auditoria').then((m) => ({ default: m.Auditoria })));
const Importar = lazy(() => import('./pages/Importar').then((m) => ({ default: m.Importar })));
const Simulador = lazy(() => import('./pages/Simulador').then((m) => ({ default: m.Simulador })));
const IA = lazy(() => import('./pages/IA').then((m) => ({ default: m.IA })));
const Creditos = lazy(() => import('./pages/Creditos').then((m) => ({ default: m.Creditos })));
const Ajuda = lazy(() => import('./pages/Ajuda').then((m) => ({ default: m.Ajuda })));
const TrocarSenha = lazy(() => import('./pages/TrocarSenha').then((m) => ({ default: m.TrocarSenha })));
const Clientes = lazy(() => import('./pages/Clientes').then((m) => ({ default: m.Clientes })));
const Nfse = lazy(() => import('./pages/Nfse').then((m) => ({ default: m.Nfse })));
const Gestao = lazy(() => import('./pages/Gestao').then((m) => ({ default: m.Gestao })));

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useSession();
  if (!can(perm)) return <section className="view on"><EmptyState icon="ti-lock" title="Sem acesso a esta área" text="Seu perfil não inclui esta tela. Fale com o administrador do escritório." /></section>;
  return children;
}

function App() {
  const { user, loading } = useSession();
  if (loading) return <div className="center-load">Carregando…</div>;
  if (!user) return <Login />;
  // senha definida pelo administrador: troca antes de usar qualquer tela
  if (user.mustChangePassword) return <Suspense fallback={<div className="center-load">Carregando…</div>}><TrocarSenha forced /></Suspense>;
  return (
    <NoteDrawerProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Guard perm="inicio"><Inicio /></Guard>} />
          <Route path="importar" element={<Guard perm="importar"><Importar /></Guard>} />
          <Route path="clientes" element={<Guard perm="clientes"><Clientes /></Guard>} />
          <Route path="notas" element={<Guard perm="notas"><Notas /></Guard>} />
          <Route path="auditoria" element={<Guard perm="auditoria"><Auditoria /></Guard>} />
          <Route path="simulador" element={<Guard perm="simulador"><Simulador /></Guard>} />
          <Route path="ia" element={<Guard perm="ia"><IA /></Guard>} />
          <Route path="nfse" element={<Guard perm="nfse"><Nfse /></Guard>} />
          <Route path="creditos" element={<Guard perm="creditos"><Creditos /></Guard>} />
          <Route path="ajuda" element={<Guard perm="ajuda"><Ajuda /></Guard>} />
          <Route path="gestao" element={<Guard perm="gestao"><Gestao /></Guard>} />
          <Route path="senha" element={<TrocarSenha />} />
          <Route path="*" element={<section className="view on"><EmptyState icon="ti-map-off" title="Página não encontrada" text="O endereço não existe ou foi movido. Volte ao início e escolha a tela pelo menu." action={<Link className="btn primary" to="/">Voltar ao início</Link>} /></section>} />
        </Route>
      </Routes>
    </NoteDrawerProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
