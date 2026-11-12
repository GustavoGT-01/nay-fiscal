// Apaga notas, itens, achados, envios e rodadas de auditoria de TODOS os escritorios.
// Mantem tabelas, usuarios, perfis, clientes, estabelecimentos e regras.
// Uso: npm run db:clear
try { process.loadEnvFile(); } catch { /* sem .env */ }
import { prisma } from '../src/config/db.js';
import { wipeClientData } from '../src/services/wipe.js';

const r = await wipeClientData(prisma);
console.log('Dados apagados:');
console.log(`  notas ............ ${r.documents}`);
console.log(`  itens ............ ${r.items}`);
console.log(`  achados .......... ${r.findings}`);
console.log(`  envios ........... ${r.uploads}`);
console.log(`  auditorias ....... ${r.auditRuns}`);
console.log('Usuários, clientes e regras mantidos.');
await prisma.$disconnect();
