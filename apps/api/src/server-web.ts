// Sobe a API servindo tambem o front compilado (apps/web/dist). Usado pelo tunel.bat:
// so uma porta, sem o servidor de desenvolvimento do Vite exposto na internet.
process.env.SERVE_WEB = '1';
process.env.NODE_ENV ??= 'production';
await import('./server.js');
export {};
