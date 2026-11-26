import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

// A gaveta de verdade busca a nota na API; aqui ela so mostra o id que recebeu e expoe o "fechar".
vi.mock('../src/components/note-drawer/Drawer', () => ({
  NoteDrawer: ({ id, onClose }: { id: string | null; onClose: () => void }) => (
    <div>
      <output aria-label="aberta">{id ?? 'nenhuma'}</output>
      <button onClick={onClose}>fechar</button>
    </div>
  ),
}));

const { NoteDrawerProvider, useOpenNote } = await import('../src/components/note-drawer/context');

function Pagina() {
  const open = useOpenNote();
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <div>
      <button onClick={() => open('n42')}>abrir</button>
      <button onClick={() => nav(-1)}>voltar</button>
      <output aria-label="url">{loc.pathname + loc.search}</output>
    </div>
  );
}

const tela = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <NoteDrawerProvider><Pagina /></NoteDrawerProvider>
    </MemoryRouter>,
  );
const aberta = () => screen.getByLabelText('aberta').textContent;
const url = () => screen.getByLabelText('url').textContent;

describe('gaveta da nota na URL', () => {
  it('abrir põe a nota na URL, mantém os outros filtros, e fechar volta ao endereço anterior', async () => {
    tela('/notas?veredito=credito_em_risco');
    expect(aberta()).toBe('nenhuma');
    await userEvent.click(screen.getByText('abrir'));
    expect(aberta()).toBe('n42');
    expect(url()).toBe('/notas?veredito=credito_em_risco&nota=n42');
    await userEvent.click(screen.getByText('fechar'));
    expect(aberta()).toBe('nenhuma');
    expect(url()).toBe('/notas?veredito=credito_em_risco');
  });

  it('o botão Voltar do navegador fecha a gaveta', async () => {
    tela('/notas');
    await userEvent.click(screen.getByText('abrir'));
    await userEvent.click(screen.getByText('voltar'));
    expect(aberta()).toBe('nenhuma');
  });

  it('abrir um link com ?nota= já mostra a nota; fechar tira só o parâmetro', async () => {
    tela('/auditoria?nota=abc&de=2026-10-01');
    expect(aberta()).toBe('abc');
    await userEvent.click(screen.getByText('fechar'));
    expect(aberta()).toBe('nenhuma');
    expect(url()).toBe('/auditoria?de=2026-10-01');
  });
});
