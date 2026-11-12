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
if (senha.length < 10 || senha === 'nay12345' || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
  console.log('A senha precisa ter pelo menos 10 caracteres, com letras e números (e não pode ser a de demonstração).');
  process.exit(1);
}
const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (!u) {
  console.log(`Usuário ${email} não encontrado.`);
  process.exit(1);
}
// tokenVersion + 1: quem estava logado com a senha antiga cai na hora
await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(senha, 12), tokenVersion: { increment: 1 } } });
console.log(`Senha de ${u.email} trocada. Sessões abertas foram encerradas.`);
await prisma.$disconnect();
