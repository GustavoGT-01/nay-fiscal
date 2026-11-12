// Nay Fiscal desktop: sobe a API (Fastify + SQLite) dentro do Electron e mostra o front numa janela propria.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('Nay Fiscal'); // pasta de dados: %APPDATA%Nay Fiscal
let win = null;
let logFile = null;

function log(msg) {
  try { if (logFile) fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`); } catch { /* sem log */ }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// em producao os arquivos ficam em <instalacao>/resources; em dev (electron .) em apps/desktop/app
function resDir() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, 'app');
}

function jwtSecret(dataDir) {
  const f = path.join(dataDir, 'segredo.txt');
  try {
    const s = fs.readFileSync(f, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch { /* primeira execucao */ }
  const s = randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

async function start() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  logFile = path.join(dataDir, 'nay.log');
  const res = resDir();

  const db = path.join(dataDir, 'nay.db');
  if (!fs.existsSync(db)) {
    log('primeira execucao: copiando banco modelo');
    fs.copyFileSync(path.join(res, 'template.db'), db);
  }

  const port = await freePort();
  Object.assign(process.env, {
    DATABASE_URL: 'file:' + db.split('\\').join('/'),
    JWT_SECRET: jwtSecret(dataDir),
    API_PORT: String(port),
    NAY_WEB_DIST: path.join(res, 'web') + path.sep,
    NODE_ENV: 'production',
  });
  log(`subindo API na porta ${port}`);
  await import(pathToFileURL(path.join(res, 'server', 'api.mjs')).href);
  log('API no ar');

  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1024, minHeight: 640,
    title: 'Nay Fiscal', autoHideMenuBar: true, show: false, backgroundColor: '#14101f',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  const origin = `http://127.0.0.1:${port}`;
  // links para fora do app abrem no navegador do sistema; a janela nunca navega para outro site
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(origin)) shell.openExternal(url);
    return { action: url.startsWith(origin) ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
  await win.loadURL(origin);
  // primeira abertura: tema escuro (o padrao do index.html e claro e o localStorage do app comeca vazio)
  await win.webContents.executeJavaScript(
    "try{if(!localStorage.getItem('nay.theme')){localStorage.setItem('nay.theme','dark');document.documentElement.dataset.theme='dark';}}catch(e){}",
  ).catch(() => {});
  win.show();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(start).catch((err) => {
    log(`falha ao iniciar: ${err && err.stack || err}`);
    dialog.showErrorBox('Nay Fiscal', `Não foi possível iniciar o sistema.\n\n${err && err.message || err}\n\nDetalhes em: ${logFile}`);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
}
