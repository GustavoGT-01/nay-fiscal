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
type Filtros = { verdict: string; supplier: string; status: string; from: string; to: string; cfop: string; model: string; sort: string; order: string };
const filtros = () => useNotes.mock.calls.at(-1)![1] as Filtros;
const f = filtros;

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
    expect(screen.getByText(/Fornecedor 11\.222\.333\/0001-81/)).toBeInTheDocument();
  });

  it('a etiqueta do fornecedor limpa só o fornecedor', async () => {
    tela('/notas?fornecedor=11222333000181');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar fornecedor' }));
    expect(filtros().supplier).toBe('');
    expect(screen.queryByText(/Filtrando por/)).not.toBeInTheDocument();
  });

  it('período, CFOP e modelo vão para a consulta, viram etiquetas e se limpam um a um', async () => {
    tela();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('De'), '2026-10-01');
    await user.type(screen.getByLabelText('até'), '2026-10-31');
    await user.type(screen.getByLabelText('CFOP'), '6912');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de documento' }), '57');
    expect(f()).toMatchObject({ from: '2026-10-01', to: '2026-10-31', cfop: '6912', model: '57' });
    expect(screen.getByText('Período 01/10 a 31/10')).toBeInTheDocument();
    expect(screen.getByText('CFOP 6912')).toBeInTheDocument();
    expect(document.querySelector('.chips')).toHaveTextContent('CT-e (57)'); // a opcao do seletor tem o mesmo texto

    await user.click(screen.getByRole('button', { name: 'Limpar período' }));
    expect(f()).toMatchObject({ from: '', to: '', cfop: '6912', model: '57' });
    await user.click(screen.getByRole('button', { name: 'Limpar CFOP' }));
    expect(f().cfop).toBe('');
  });

  it('CFOP incompleto não refaz a consulta (a API pede 4 dígitos)', async () => {
    tela();
    await userEvent.type(screen.getByLabelText('CFOP'), '69');
    expect(f().cfop).toBe('');
    expect(screen.queryByText('CFOP 69')).not.toBeInTheDocument();
  });

  it('clicar no título de uma coluna ordena; clicar de novo inverte', async () => {
    tela();
    expect(f()).toMatchObject({ sort: 'issuedAt', order: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: /^Valor/ }));
    expect(f()).toMatchObject({ sort: 'total', order: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: /^Valor/ }));
    expect(f()).toMatchObject({ sort: 'total', order: 'asc' });
    expect(screen.getByRole('columnheader', { name: /Valor/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /^Situação/ }));
    expect(f()).toMatchObject({ sort: 'status', order: 'asc' });
  });

  it('trocar o filtro de situação refaz a consulta com o novo valor', async () => {
    tela();
    await userEvent.click(screen.getByRole('button', { name: 'Com erro' }));
    expect(filtros().status).toBe('erro');
  });
});
