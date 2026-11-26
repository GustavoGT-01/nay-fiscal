import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../src/lib/api';
import { ToastProvider } from '../src/lib/ui';

// Creditos e a aba SPED da Auditoria, com a sessao e as consultas simuladas.
const q = (data: unknown, extra: object = {}) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...extra });
let credits = q(undefined);
let spedFiles = q([]);
let spedDetail = q(undefined);
const useCredits = vi.fn((..._a: unknown[]) => credits);
const useSpedDetail = vi.fn((..._a: unknown[]) => spedDetail);
const openNote = vi.fn();

vi.mock('../src/hooks/useCredits', () => ({ useCredits: (...a: unknown[]) => useCredits(...a) }));
vi.mock('../src/hooks/useSped', () => ({ SPED_PER_PAGE: 50, useSpedFiles: () => spedFiles, useSpedDetail: (...a: unknown[]) => useSpedDetail(...a) }));
vi.mock('../src/lib/session', () => ({ useSession: () => ({ client: { id: 'c1', name: 'Empresa Exemplo', cnpj: '11222333000181' } }) }));
vi.mock('../src/components/note-drawer', () => ({ useOpenNote: () => openNote }));

const { Creditos } = await import('../src/pages/Creditos');
const { AuditoriaSped } = await import('../src/pages/AuditoriaSped');

const tela = (ui: React.ReactNode) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>);

beforeEach(() => {
  useCredits.mockClear(); useSpedDetail.mockClear(); openNote.mockClear();
  credits = q(undefined, { isLoading: true });
  spedFiles = q([]);
  spedDetail = q(undefined);
});

const linha = (key: string, label: string, p: Partial<{ notes: number; ibs: number; cbs: number; pode: number; risco: number; nao: number }> = {}) =>
  ({ key, label, notes: 3, ibs: 10, cbs: 90, pode: 3, risco: 0, nao: 0, ...p });

describe('tela Créditos', () => {
  it('mostra os três totais e uma etiqueta por situação do crédito', () => {
    credits = q({
      totals: { pode: 18420, risco: 6115.3, nao: 1240 }, notAudited: 0, group: 'forn',
      rows: [linha('1', 'Aço Brasil'), linha('2', 'Espumas Nordeste', { pode: 0, risco: 61 }), linha('3', 'Transportes Alfa', { pode: 0, nao: 9 }), linha('4', 'Mista', { pode: 2, nao: 1 }), linha('5', 'Um erro', { pode: 0, risco: 1 })],
    });
    tela(<Creditos />);
    expect(screen.getByText(/18\.420,00/)).toBeInTheDocument();
    expect(screen.getByText(/6\.115,30/)).toBeInTheDocument();
    expect(screen.getByText('Pode creditar')).toBeInTheDocument();
    expect(screen.getByText('Em risco: 61 notas com erro')).toBeInTheDocument();
    expect(screen.getByText('Em risco: 1 nota com erro')).toBeInTheDocument();
    expect(screen.getByText('Não creditar')).toBeInTheDocument();
    expect(screen.getByText('Não creditar: 1 nota')).toBeInTheDocument();
  });

  it('trocar para "Por mês" e o período refaz a consulta', async () => {
    credits = q({ totals: { pode: 0, risco: 0, nao: 0 }, notAudited: 0, group: 'forn', rows: [linha('1', 'Aço')] });
    tela(<Creditos />);
    await userEvent.click(screen.getByRole('button', { name: 'Por mês' }));
    expect(useCredits.mock.calls.at(-1)![1]).toBe('mes');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Período' }), screen.getAllByRole('option')[1]!);
    expect(useCredits.mock.calls.at(-1)![2]).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('avisa quantas notas de entrada ainda não foram auditadas', () => {
    credits = q({ totals: { pode: 10, risco: 0, nao: 0 }, notAudited: 7, group: 'forn', rows: [linha('1', 'Aço')] });
    tela(<Creditos />);
    expect(screen.getByText(/7 notas de entrada ainda não foram auditadas/)).toBeInTheDocument();
  });

  it('sem nenhuma nota de entrada, explica e leva à importação (não mostra tabela vazia)', () => {
    credits = q({ totals: { pode: 0, risco: 0, nao: 0 }, notAudited: 0, group: 'forn', rows: [] });
    tela(<Creditos />);
    expect(screen.getByText('Nenhuma nota de entrada neste período')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeDisabled();
  });

  it('com a consulta falhando, mostra o erro com "Tentar de novo"', () => {
    credits = q(undefined, { isError: true, error: new ApiError(500, 'Servidor ocupado.') });
    tela(<Creditos />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os créditos.');
  });
});

const arquivo = { id: 'f1', fileName: 'EFD-092026.txt', cnpj: '11222333000181', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-09-30T00:00:00.000Z', entries: 312, ignored: 0, divergenceCount: 13, createdAt: '2026-10-05T12:00:00.000Z' };
const div = (id: string, kind: string, number: string, p: object = {}) => ({ id, kind, key: '0'.repeat(44), number, documentId: 'd' + id, sped: 'R$ 27.112,00', xml: 'R$ 27.121,00', ...p });

describe('aba SPED da Auditoria', () => {
  it('sem arquivo importado, orienta a importar', () => {
    tela(<AuditoriaSped />);
    expect(screen.getByText('Nenhum SPED importado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ir para Importar/ })).toBeInTheDocument();
  });

  it('mostra o mês do arquivo, os totais por tipo e as divergências lado a lado', () => {
    spedFiles = q([arquivo]);
    spedDetail = q({ file: arquivo, kinds: { valor: 7, sem_xml: 3, fora_do_sped: 2, situacao: 1 }, total: 13, truncated: false, rows: [div('1', 'valor', '4498'), div('2', 'sem_xml', '4503', { documentId: null, xml: 'XML não importado' })] });
    tela(<AuditoriaSped />);
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument();
    const kpis = [...document.querySelectorAll('.kpi')].map((k) => k.textContent);
    expect(kpis).toContain('312notas no arquivo');
    expect(kpis).toContain('7valor diferente');
    expect(kpis).toContain('3nota sem XML importado');
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('4498')).toBeInTheDocument();
    expect(within(tabela).getByText('Valor')).toBeInTheDocument();
    expect(within(tabela).getByText('XML não importado')).toBeInTheDocument();
    expect(screen.getByText('13 divergências, página 1 de 1')).toBeInTheDocument();
  });

  it('o filtro por tipo vai para a consulta; clicar numa linha abre a nota, e a sem nota não abre', async () => {
    spedFiles = q([arquivo]);
    spedDetail = q({ file: arquivo, kinds: { valor: 1, sem_xml: 1 }, total: 2, truncated: false, rows: [div('1', 'valor', '4498'), div('2', 'sem_xml', '4503', { documentId: null })] });
    tela(<AuditoriaSped />);
    await userEvent.click(screen.getByRole('button', { name: 'Sem XML' }));
    expect(useSpedDetail.mock.calls.at(-1)).toEqual(['f1', 'sem_xml', 0]);
    await userEvent.click(screen.getByText('4498'));
    expect(openNote).toHaveBeenCalledWith('d1');
    await userEvent.click(screen.getByText('4503'));
    expect(openNote).toHaveBeenCalledTimes(1);
  });

  it('arquivo que confere diz isso, em vez de uma tabela vazia sem explicação', () => {
    const limpo = { ...arquivo, divergenceCount: 0 };
    spedFiles = q([limpo]);
    spedDetail = q({ file: limpo, kinds: {}, total: 0, truncated: false, rows: [] });
    tela(<AuditoriaSped />);
    expect(screen.getByText('O SPED confere com as notas importadas.')).toBeInTheDocument();
  });

  it('avisa quando o arquivo tem mais divergências do que as guardadas', () => {
    const grande = { ...arquivo, divergenceCount: 25000 };
    spedFiles = q([grande]);
    spedDetail = q({ file: grande, kinds: { valor: 10000 }, total: 10000, truncated: true, rows: [div('1', 'valor', '1')] });
    tela(<AuditoriaSped />);
    expect(screen.getByText(/25\.000 divergências; só as primeiras/)).toBeInTheDocument();
  });
});
