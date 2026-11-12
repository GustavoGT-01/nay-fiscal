try { process.loadEnvFile(); } catch { /* sem .env: usa padroes de desenvolvimento */ }
import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();
await app.listen({ port: env.port, host: '127.0.0.1' });
console.log(`Nay Fiscal API em http://localhost:${env.port}`);