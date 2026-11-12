import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { syncRules } from './models/rule.js';
import { clientIp } from './services/client-ip.js';
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILES } from './services/ingest/limits.js';

const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));


/** Monta a API sem abrir porta (usado pelo server.ts e pelos testes). */
export async function buildApp() {
  if (!env.hasStrongJwtSecret && !env.isTest) {
    console.warn('JWT_SECRET ausente ou fraco: usando um segredo aleatório (as sessões caem quando a API reinicia). Rode scripts\\garantir-segredo.ps1.');
  }

  const app = Fastify({
    logger: { level: 'warn', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 1024 * 1024, // JSON; os arquivos vao pelo multipart, com limites proprios
  });

  await app.register(helmet, {
    // a API so devolve JSON/arquivos; o front (quando servido daqui) tem a propria CSP abaixo
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null, // o modo local roda em http://localhost
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, { origin: env.webOrigin, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', keyGenerator: clientIp });
  await app.register(jwt, {
    secret: env.jwtSecret,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_FILE_BYTES, files: MAX_UPLOAD_FILES, fields: 10, fieldSize: 1024, parts: MAX_UPLOAD_FILES + 10 },
    throwFileSizeLimit: true,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ message: 'Dados inválidos.', issues: err.issues.map((i) => ({ path: i.path, message: i.message })) });
    // findUniqueOrThrow / findFirstOrThrow: registro inexistente (ou de outro escritorio) = 404, nao 500
    if ((err as { code?: string }).code === 'P2025') return reply.code(404).send({ message: 'Registro não encontrado.' });
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    if (code >= 500) req.log.error(err);
    return reply.code(code).send({ message: code >= 500 ? 'Algo deu errado no servidor. Tente de novo.' : (err as Error).message });
  });

  await registerRoutes(app);

  // front compilado servido pela propria API (modo tunel): sem servidor de desenvolvimento exposto
  if (env.serveWeb) {
    if (!existsSync(WEB_DIST)) throw new Error('SERVE_WEB=1, mas apps/web/dist não existe. Rode "npm run build -w @nay/web".');
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if ((req.method === 'GET' || req.method === 'HEAD') && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ message: 'Não encontrado.' });
    });
  }

  await syncRules();
  return app;
}
