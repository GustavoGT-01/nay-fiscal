import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/common.css';
import './styles/inicio.css';
import './styles/importar.css';
import './styles/notas.css';
import './styles/auditoria.css';
import './styles/drawer.css';
import './styles/simulador.css';
import './styles/clientes-ia.css';
import './styles/overlays.css';
import './styles/responsive.css';
import './styles/extras.css';
import './styles/login.css';
import { SessionProvider, useSession } from './lib/session';
import { EmptyState, ToastProvider } from './lib/ui';
import { NoteDrawerProvider } from './components/note-drawer';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Notas } from './pages/Notas';
import { Auditoria } from './pages/Auditoria';
import { Importar } from './pages/Importar';
import { Simulador } from './pages/Simulador';
import { IA } from './pages/IA';
import { EmBreve } from './pages/Outras';
import { Clientes } from './pages/Clientes';
import { Nfse } from './pages/Nfse';
import { Gestao } from './pages/Gestao';

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
          <Route path="creditos" element={<Guard perm="creditos"><EmBreve k="creditos" /></Guard>} />
          <Route path="ajuda" element={<Guard perm="ajuda"><EmBreve k="ajuda" /></Guard>} />
          <Route path="gestao" element={<Guard perm="gestao"><Gestao /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
