import { defineConfig } from 'vitest/config';

// Os arquivos de teste rodam em paralelo e boa parte do tempo e bcrypt de custo 12 e o CLI do Prisma
// (migrations.test.ts): com a maquina carregada, e no CI do Windows, 5 s nao bastam para um caso.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
