try { process.loadEnvFile(); } catch { /* sem .env: usa padroes de desenvolvimento */ }
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/db.js';

// tarefas que estavam rodando quando a API caiu nao voltam sozinhas: marca como erro.
// A instancia do tunel (SERVE_WEB) divide o banco com a do iniciar.bat e nao mexe nas tarefas dela.
if (!env.serveWeb) await prisma.upload.updateMany({ where: { status: { in: ['PENDENTE', 'PROCESSANDO'] } }, data: { status: 'ERRO', message: 'Interrompido: a API reiniciou durante a importação. Envie de novo.' } }).catch(() => {});
if (!env.serveWeb) await prisma.auditRun.updateMany({ where: { status: 'RODANDO' }, data: { status: 'ERRO', finishedAt: new Date() } }).catch(() => {});

const app = await buildApp();
await app.listen({ port: env.port, host: '127.0.0.1' });
console.log(`Nay Fiscal API em http://localhost:${env.port}${env.serveWeb ? ' (servindo o front compilado)' : ''}`);
