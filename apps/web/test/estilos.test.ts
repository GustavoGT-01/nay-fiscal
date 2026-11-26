import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '@nay/shared';
import { gerarIcones, gerarTokens, ICONS_CSS, nomesCitados, TOKENS_CSS } from '../scripts/gerar-estilos.mjs';

// Os estilos que vem de outro lugar (mockup e pacote de icones) nao podem ficar para tras.
const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const estilo = (nome: string) => ler(fileURLToPath(new URL(`../src/styles/${nome}`, import.meta.url)));
const RODE = 'desatualizado: rode `npm run estilos -w @nay/web`';

describe('arquivos gerados', () => {
  it('tokens.css é o que está no mockup', () => {
    expect(ler(TOKENS_CSS), RODE).toBe(gerarTokens());
  });

  it('icons.css tem exatamente os ícones citados no código', () => {
    expect(ler(ICONS_CSS), RODE).toBe(gerarIcones());
  });

  it('todo ícone citado existe no CSS (um nome errado vira um quadrado em branco na tela)', () => {
    const css = ler(ICONS_CSS);
    const faltam = [...nomesCitados()].filter((n) => !css.includes(`.ti-${n}:before`));
    expect(faltam).toEqual([]);
  });

  it('os ícones do menu estão incluídos', () => {
    const css = ler(ICONS_CSS);
    for (const s of SCREENS) expect(css, s.icon).toContain(`.ti-${s.icon}:before`);
  });
});

describe('cores num lugar só', () => {
  it('o app não redeclara os tokens do mockup', () => {
    expect(estilo('base.css')).not.toMatch(/--(uva|caju|limao|maracuja|jabuticaba|surface|muted|text|line|bg):/);
  });

  it('o login só escreve cor em hexadecimal na tabela do topo (máscaras em preto à parte)', () => {
    const linhas = estilo('login.css').split('\n').filter((l) => !l.startsWith('.nf-root{--nf-'));
    expect(linhas.join('\n').match(/#(?!000\b)[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it('o Início só declara cor em variável (branco à parte)', () => {
    const semVariaveis = estilo('painel.css').replace(/--[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8}/g, '');
    expect(semVariaveis.match(/#(?!fff\b)[0-9a-fA-F]{3,8}\b/gi)).toBeNull();
  });
});
