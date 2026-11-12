// Gera o app desktop (Electron). Uso: node scripts/build-desktop.mjs [--installer]
// Sem --installer prepara apps/desktop/app (da pra testar com "npx electron apps/desktop").
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(root, ...p);
const out = at('apps/desktop/app');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'server'), { recursive: true });

console.log('1/5 front');
run(npm, ['run', 'build', '-w', '@nay/web'], { env: { ...process.env, VITE_DEMO_HINT: '1' } });
cpSync(at('apps/web/dist'), join(out, 'web'), { recursive: true });

console.log('2/5 API (bundle)');
await build({
  entryPoints: [at('apps/api/src/server-web.ts')],
  outfile: join(out, 'server/api.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning',
  external: ['@prisma/client', '.prisma/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(at('apps/api/src/views/pdf/note.css'), join(out, 'server/note.css'));

console.log('3/5 Prisma (cliente + motor nativo)');
for (const p of ['@prisma/client', '.prisma/client']) cpSync(at('node_modules', p), join(out, 'server/node_modules', p), { recursive: true });

console.log('4/5 banco modelo com dados de demonstracao');
const tpl = join(out, 'template.db');
const env = { ...process.env, DATABASE_URL: 'file:' + tpl.split('\\').join('/') };
run(npx, ['prisma', 'db', 'push', '--skip-generate'], { cwd: at('apps/api'), env });
run(npx, ['tsx', 'prisma/seed.ts'], { cwd: at('apps/api'), env });
if (!existsSync(tpl)) throw new Error('banco modelo nao foi criado');

if (process.argv.includes('--installer')) {
  console.log('5/5 instalador');
  run(npx, ['electron-builder', '--win', 'nsis'], { cwd: at('apps/desktop') });
} else console.log('5/5 pulado (use --installer)');
