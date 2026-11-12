/**
 * Troca a senha de um usuario.
 * Uso: npm run senha -- <email> <nova-senha>
 */
try { process.loadEnvFile(); } catch { /* opcional */ }
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/db.js';

const [email, senha] = process.argv.slice(2);
if (!email || !senha) {
  console.log('Uso: npm run senha -- <email> <nova-senha>');
  process.exit(1);
}
if (senha.length < 8) {
  console.log('A senha precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}
const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (!u) {
  console.log(`Usuário ${email} não encontrado.`);
  process.exit(1);
}
await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(senha, 10) } });
console.log(`Senha de ${u.email} trocada.`);
await prisma.$disconnect();
