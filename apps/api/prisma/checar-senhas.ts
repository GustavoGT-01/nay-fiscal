/**
 * Confere se algum usuario ativo ainda usa a senha de demonstracao.
 * Saida 0 = tudo certo; 2 = ha senha de demonstracao (o tunel nao deve abrir).
 * Uso: npm run checar-senhas -w @nay/api
 */
try { process.loadEnvFile(); } catch { /* opcional */ }
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/db.js';

const DEMO = ['nay12345'];
const list = await prisma.user.findMany({ where: { active: true }, select: { email: true, passwordHash: true } });
const weak: string[] = [];
for (const u of list) {
  for (const p of DEMO) if (await bcrypt.compare(p, u.passwordHash)) weak.push(u.email);
}
await prisma.$disconnect();
if (weak.length) {
  console.log(' Estes usuarios ainda usam a senha de demonstracao:');
  for (const e of weak) console.log(`   - ${e}   ->  npm run senha -- ${e} <nova-senha>`);
  process.exit(2);
}
console.log(' Nenhum usuario com senha de demonstracao.');
