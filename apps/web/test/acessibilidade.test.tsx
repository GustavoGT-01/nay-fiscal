import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../src/lib/ui';
import { Menu, Meter, Pager, rowProps, useCopy, useCountUp } from '../src/lib/widgets';

// As pecas compartilhadas: teclado (Enter, Espaco, setas, Esc) e o que elas prometem ao usuario.

describe('linha clicável', () => {
  const abrir = vi.fn();
  const tabela = () => render(
    <table><tbody><tr data-testid="linha" {...rowProps(abrir)}><td>Nota 1</td><td><button type="button">PDF</button></td></tr></tbody></table>,
  );
  beforeEach(() => abrir.mockClear());

  it('abre com clique, Enter e Espaço, e o Espaço não rola a página', async () => {
    tabela();
    const user = userEvent.setup();
    await user.click(screen.getByText('Nota 1'));
    screen.getByTestId('linha').focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(abrir).toHaveBeenCalledTimes(3);
    const espaco = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => { screen.getByTestId('linha').dispatchEvent(espaco); });
    expect(espaco.defaultPrevented).toBe(true);
  });

  it('tecla num botão dentro da linha não abre a linha', async () => {
    tabela();
    screen.getByRole('button', { name: 'PDF' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(abrir).toHaveBeenCalledTimes(1); // so o clique que o Enter gera no proprio botao sobe ate a linha
  });
});

describe('menu suspenso', () => {
  function Tela({ onPick = () => {} }: { onPick?: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen((x) => !x)}>Abrir</button>
        <Menu open={open} onClose={() => setOpen(false)} label="Exportar">
          <button role="menuitem" onClick={() => onPick('xlsx')}>Excel</button>
          <button role="menuitem" disabled>Indisponível</button>
          <button role="menuitem" onClick={() => onPick('csv')}>CSV</button>
        </Menu>
        <button type="button">Depois</button>
      </>
    );
  }
  const menu = () => screen.getByRole('menu', { hidden: true });

  it('fechado não recebe foco; aberto, o foco vai ao primeiro item e as setas andam, pulando o desativado', async () => {
    render(<Tela />);
    expect(menu()).toHaveAttribute('inert');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(menu()).not.toHaveAttribute('inert');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Excel' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Excel' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Excel' })).toHaveFocus();
  });

  it('Esc fecha e devolve o foco ao botão que abriu', async () => {
    render(<Tela />);
    const user = userEvent.setup();
    const botao = screen.getByRole('button', { name: 'Abrir' });
    await user.click(botao);
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Excel' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(menu()).toHaveAttribute('inert');
    expect(botao).toHaveFocus();
  });
});

describe('copiar', () => {
  function Botao() {
    const copy = useCopy();
    return <button type="button" onClick={() => void copy('texto', 'Parecer copiado')}>Copiar</button>;
  }
  const com = (clipboard: unknown) => Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

  it('só diz que copiou quando copiou', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    com({ writeText }); // depois do setup: o user-event instala a propria area de transferencia
    render(<ToastProvider><Botao /></ToastProvider>);
    await user.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('texto');
    expect(await screen.findByText('Parecer copiado')).toBeInTheDocument();
  });

  it.each([
    ['o navegador negar', { writeText: vi.fn().mockRejectedValue(new Error('negado')) }],
    ['não houver área de transferência', undefined],
  ])('avisa quando %s', async (_, clipboard) => {
    const user = userEvent.setup();
    com(clipboard);
    render(<ToastProvider><Botao /></ToastProvider>);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText(/Não foi possível copiar/)).toBeInTheDocument();
    expect(screen.queryByText('Parecer copiado')).not.toBeInTheDocument();
  });
});

describe('paginação, medidor e contador', () => {
  it('a paginação mostra o resumo, anda e desativa nas pontas', async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pager summary="30 notas" page={0} pages={3} onPage={onPage} />);
    expect(screen.getByText('30 notas, página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPage).toHaveBeenCalledWith(1);
    rerender(<Pager summary="30 notas" page={2} pages={3} onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });

  it('o medidor reparte pela proporção, omite o zero e garante largura mínima à parte pequena', () => {
    const { container } = render(<Meter className="meter" total={100} minPx={8} parts={[[98, 'green'], [0, 'yellow'], [2, 'red']]} />);
    const partes = [...container.querySelectorAll('i')];
    expect(partes.map((p) => p.style.width)).toEqual(['98%', '2%']);
    expect(partes.map((p) => p.style.minWidth)).toEqual(['', '8px']);
  });

  it('o contador chega ao alvo', async () => {
    const Num = () => <output>{useCountUp(1234)}</output>;
    render(<Num />);
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1234'), { timeout: 3000 });
  });
});
