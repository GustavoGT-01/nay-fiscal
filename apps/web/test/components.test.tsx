import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiError } from '../src/lib/api';
import { EmptyState, QueryError, Seg } from '../src/lib/ui';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

describe('Seg (controle segmentado)', () => {
  const options = [{ value: 'a', label: 'Todas' }, { value: 'b', label: 'Com erro' }, { value: 'c', label: 'Conformes' }];

  it('marca só a opção atual como pressionada', () => {
    render(<Seg label="Filtro" value="b" onChange={() => {}} options={options} />);
    expect(screen.getByRole('group', { name: 'Filtro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Com erro' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('avisa a opção clicada e acompanha o valor quando o pai o troca', async () => {
    const seen: string[] = [];
    function Pai() {
      const [v, setV] = useState('a');
      return <Seg value={v} onChange={(x) => { seen.push(x); setV(x); }} options={options} />;
    }
    render(<Pai />);
    await userEvent.click(screen.getByRole('button', { name: 'Conformes' }));
    expect(seen).toEqual(['c']);
    expect(screen.getByRole('button', { name: 'Conformes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('QueryError (falha ao carregar)', () => {
  it('mostra o que não carregou e a mensagem que o servidor mandou', () => {
    render(<QueryError error={new ApiError(500, 'Servidor ocupado.')} onRetry={() => {}} what="as notas" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as notas.');
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor ocupado.');
  });

  it('erro de rede (em inglês, do navegador) vira texto fixo em português', () => {
    render(<QueryError error={new TypeError('Failed to fetch')} onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os dados.');
    expect(screen.getByRole('alert')).toHaveTextContent('Verifique a conexão e tente de novo.');
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('"Tentar de novo" chama onRetry', async () => {
    const onRetry = vi.fn();
    render(<QueryError error={new Error('x')} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('EmptyState', () => {
  it('mostra título, texto e a ação', () => {
    render(<EmptyState icon="ti-lock" title="Sem acesso" text="Fale com o administrador." action={<button>Voltar</button>} />);
    expect(screen.getByRole('heading', { name: 'Sem acesso' })).toBeInTheDocument();
    expect(screen.getByText('Fale com o administrador.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  const Quebrada = () => {
    throw new Error('falha de renderização');
  };

  it('mostra a tela de erro com opção de recarregar quando um filho quebra', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Quebrada /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela');
    expect(screen.getByRole('button', { name: /Recarregar/ })).toBeInTheDocument();
    expect(log).toHaveBeenCalled(); // o erro vai para o console, nao some em silencio
    log.mockRestore();
  });

  it('sem erro, só renderiza os filhos', () => {
    render(<ErrorBoundary><p>tudo certo</p></ErrorBoundary>);
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog (ação destrutiva)', () => {
  const props = { title: 'Apagar tudo?', text: 'Isso não tem volta.', typeToConfirm: 'APAGAR', onConfirm: () => {}, onCancel: () => {} };

  it('fechado, fica fora da ordem de tabulação e não mostra o conteúdo', () => {
    render(<ConfirmDialog {...props} open={false} />);
    expect(screen.queryByText('Apagar tudo?')).not.toBeInTheDocument();
    expect(document.querySelector('[role="alertdialog"]')).toHaveAttribute('inert');
  });

  it('o botão só libera depois de digitar a palavra exata', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props} open onConfirm={onConfirm} />);
    const apagar = screen.getByRole('button', { name: /Apagar$/ });
    expect(apagar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Digite APAGAR para confirmar'), 'apagar');
    expect(apagar).toBeDisabled(); // minúsculas não valem
    await userEvent.clear(screen.getByLabelText('Digite APAGAR para confirmar'));
    await userEvent.type(screen.getByLabelText('Digite APAGAR para confirmar'), 'APAGAR');
    expect(apagar).toBeEnabled();
    await userEvent.click(apagar);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Esc e Cancelar chamam onCancel; ocupado trava os botões', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog {...props} open onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    rerender(<ConfirmDialog {...props} open busy onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Apagando/ })).toBeDisabled();
  });

  it('sem palavra para digitar, confirma direto', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="Remover?" text="x" open confirmLabel="Remover" onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Remover$/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
