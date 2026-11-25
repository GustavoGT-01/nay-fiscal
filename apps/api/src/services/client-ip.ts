import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * IP do visitante (rate-limit e bloqueio de login). Pelo tunel da Cloudflare todos chegam como
 * 127.0.0.1; ai vale o CF-Connecting-IP, que a Cloudflare reescreve. So e aceito no modo tunel
 * (SERVE_WEB, ou TRUST_CF_IP=1 nos testes) e vindo do proprio computador: exposta direto, a API ignoraria
 * o cabecalho forjado. NODE_ENV=test sozinho nao basta: uma configuracao errada nao abre o atalho.
 */
export function clientIp(req: FastifyRequest) {
  const cf = req.headers['cf-connecting-ip'];
  if ((env.serveWeb || env.trustCfIp) && LOOPBACK.has(req.ip) && typeof cf === 'string' && cf.length <= 45) return cf;
  return req.ip;
}
