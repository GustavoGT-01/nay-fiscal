import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../src/lib/api';
import { ToastProvider } from '../src/lib/ui';

// A tela Notas com a sessao e a consulta simuladas: o que importa aqui e o que ela mostra
// quando a consulta falha, e o que ela manda para a API a partir da URL.
type Consulta = { data?: { total: number; rows: unknown[] }; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void };
const refetch = vi.fn();
let consulta: Consulta;
const useNotes = vi.fn((..._args: unknown[]) => consulta);

vi.mock('../src/hooks/useNotes', () => ({ NOTES_PER_PAGE: 12, useNotes: (...a: unknown[]) => useNotes(...a) }));
vi.mock('../src/lib/session', () => ({ useSession: () => ({ client: { id: 'c1', name: 'Empresa Exemplo' } }) }));
vi.mock('../src/components/note-drawer', () => ({ useOpenNote: () => () => {}, docName: () => 'NF-e' }));
vi.mock('../src/lib/print', () => ({ printNote: async () => {} }));

const { Notas } = await import('../src/pages/Notas');

const tela = (url = '/notas') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider><Notas /></ToastProvider>
    </MemoryRouter>,
  );
const filtros = () => useNotes.mock.calls.at(-1)![1] as { verdict: string; supplier: string; status: string };

beforeEach(() => {
  refetch.mockClear();
  useNotes.mockClear();
  consulta = { data: { total: 0, rows: [] }, isLoading: false, isError: false, error: null, refetch };
});

describe('tela Notas', () => {
  it('com a consulta falhando, mostra o erro com "Tentar de novo" em vez de uma lista vazia', async () => {
    consulta = { isLoading: false, isError: true, error: new ApiError(500, 'Servidor ocupado.'), refetch };
    tela();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as notas.');
    expect(screen.queryByText(/Nenhuma nota encontrada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/página 1 de 1/)).not.toBeInTheDocument(); // o rodape nao contradiz o erro
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('carregando: mostra o esqueleto, sem erro nem lista', () => {
    consulta = { isLoading: true, isError: false, error: null, refetch };
    tela();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma nota encontrada/)).not.toBeInTheDocument();
    expect(document.querySelector('.skel')).not.toBeNull();
  });

  it('sem notas, diz que não achou (e não é erro)', () => {
    tela();
    expect(screen.getByText(/Nenhuma nota encontrada/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('0 notas, página 1 de 1')).toBeInTheDocument();
  });

  it('mostra as notas recebidas, com fornecedor e valor', () => {
    consulta = {
      ...consulta,
      data: { total: 1, rows: [{ id: 'n1', number: '4498', series: '1', model: '55', key: 'k', direction: 'entrada', issuedAt: '2026-11-09T12:00:00-03:00', counterpart: 'Espumas Nordeste', counterpartCnpj: '1', cfop: '6912', total: 27112, status: 'erro', verdict: '', findings: [] }] },
    };
    tela();
    expect(screen.getByText('Espumas Nordeste')).toBeInTheDocument();
    expect(screen.getByText('6912')).toBeInTheDocument();
    expect(screen.getByText(/27\.112,00/)).toBeInTheDocument();
    expect(screen.getByText('1 notas, página 1 de 1')).toBeInTheDocument();
  });

  it('veredito válido na URL vira filtro e aparece como etiqueta que se pode limpar', async () => {
    tela('/notas?veredito=credito_em_risco');
    expect(filtros().verdict).toBe('credito_em_risco');
    await userEvent.click(screen.getByRole('button', { name: /Limpar/ }));
    expect(filtros().verdict).toBe('');
  });

  it('veredito inventado na URL é ignorado: a API recusaria e a tela mostraria erro', () => {
    tela('/notas?veredito=lixo');
    expect(filtros().verdict).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('o fornecedor da URL vai para a consulta e a tela avisa que está filtrando', () => {
    tela('/notas?fornecedor=11222333000181');
    expect(filtros().supplier).toBe('11222333000181');
    expect(screen.getByText('Filtrado por fornecedor')).toBeInTheDocument();
  });

  it('trocar o filtro de situação refaz a consulta com o novo valor', async () => {
    tela();
    await userEvent.click(screen.getByRole('button', { name: 'Com erro' }));
    expect(filtros().status).toBe('erro');
  });
});
