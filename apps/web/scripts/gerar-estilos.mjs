/**
 * Gera os dois arquivos de estilo que antes eram copiados a mao:
 *   src/styles/tokens.css  cores, fontes e curvas, tiradas de design/nay-fiscal-mockup.html (fonte da verdade do visual)
 *   src/styles/icons.css   so os icones Tabler que o app usa (o pacote traz mais de 5 mil regras)
 *
 *   npm run estilos -w @nay/web
 *
 * test/estilos.test.ts falha se algum dos dois ficar desatualizado.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
export const TOKENS_CSS = join(WEB, 'src', 'styles', 'tokens.css');
export const ICONS_CSS = join(WEB, 'src', 'styles', 'icons.css');

const AVISO = (origem) => `/* GERADO por scripts/gerar-estilos.mjs a partir de ${origem}. Nao edite aqui: mude a origem e rode \`npm run estilos -w @nay/web\`. */`;
const lf = (s) => s.replace(/\r\n/g, '\n');

export function gerarTokens(mockup = readFileSync(join(ROOT, 'design', 'nay-fiscal-mockup.html'), 'utf8')) {
  const html = lf(mockup);
  const bloco = (seletor) => {
    const m = html.match(new RegExp(`^[ \\t]*${seletor.replace(/[[\]"=]/g, '\\$&')}[ \\t]*\\{\\n([\\s\\S]*?)\\n[ \\t]*\\}`, 'm'));
    if (!m) throw new Error(`Bloco ${seletor} nao encontrado no mockup.`);
    return `${seletor}{\n${m[1]}\n}`;
  };
  return `${AVISO('design/nay-fiscal-mockup.html')}\n/* ---------- Tokens: paleta "Pomar" ---------- */\n${bloco(':root')}\n${bloco('[data-theme="dark"]')}\n`;
}

/** Todos os arquivos de codigo onde um nome de icone pode aparecer. */
function fontes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return fontes(p);
    return /\.(ts|tsx|html)$/.test(e.name) ? [p] : [];
  });
}

/** Nomes citados no codigo: classes `ti-nome` e a propriedade `icon: 'nome'` (menu, em @nay/shared). */
export function nomesCitados() {
  const arquivos = [join(WEB, 'src'), join(ROOT, 'packages', 'shared', 'src'), join(ROOT, 'apps', 'api', 'src')].flatMap(fontes).concat(join(WEB, 'index.html'));
  const nomes = new Set();
  for (const f of arquivos) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?<![a-z0-9-])ti-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) nomes.add(m[1]);
    for (const m of s.matchAll(/\bicon:\s*'([a-z0-9]+(?:-[a-z0-9]+)*)'/g)) nomes.add(m[1].replace(/^ti-/, ''));
  }
  return nomes;
}

const cobre = (faixas, ponto) =>
  faixas.split(',').some((f) => {
    const [a, b = a] = f.trim().replace(/^U\+/i, '').split('-');
    return ponto >= parseInt(a, 16) && ponto <= parseInt(b, 16);
  });

export function gerarIcones(nomes = nomesCitados()) {
  const pacote = createRequire(join(WEB, 'package.json')).resolve('@tabler/icons-webfont/dist/tabler-icons.min.css');
  const css = readFileSync(pacote, 'utf8');
  const todos = new Map([...css.matchAll(/\.ti-([a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}/g)].map((m) => [m[1], m[2]]));
  const usados = [...nomes].filter((n) => todos.has(n)).sort();
  const pontos = usados.map((n) => parseInt(todos.get(n), 16));
  const base = css.match(/\.ti\{[^}]*\}/)?.[0];
  if (!base || !todos.size) throw new Error('O CSS do Tabler mudou de formato: ajuste scripts/gerar-estilos.mjs.');

  // so as faces cuja faixa de caracteres tem algum icone usado; o navegador baixa cada uma quando precisa
  const dirFontes = relative(dirname(ICONS_CSS), join(dirname(pacote), 'fonts')).replace(/\\/g, '/');
  const faces = [...css.matchAll(/@font-face\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((face) => {
      const faixa = face.match(/unicode-range:([^;}]+)/)?.[1];
      return !faixa || pontos.some((p) => cobre(faixa, p));
    })
    .map((face) => face.replace(/url\("\.\/fonts\/([^"?]+)(?:\?[^"]*)?"\)/g, `url("${dirFontes}/$1")`));

  const regras = usados.map((n) => `.ti-${n}:before{content:"\\${todos.get(n)}"}`);
  return `${AVISO('@tabler/icons-webfont (licenca MIT) e dos icones citados no codigo')}\n${[...faces, base, ...regras].join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(TOKENS_CSS, gerarTokens());
  writeFileSync(ICONS_CSS, gerarIcones());
  console.log(`tokens.css e icons.css atualizados (${(gerarIcones().match(/:before\{/g) ?? []).length} icones).`);
}
