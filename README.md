# Nay Fiscal

Auditoria de notas fiscais para a Reforma Tributária (IBS, CBS e cClassTrib). Você importa os XMLs, o motor de regras confere cada item e a tela mostra o erro, o motivo e a correção exata no XML.

- Visual: `design/nay-fiscal-mockup.html` (fonte da verdade).
- Melhorias previstas: `doc/melhorias.md`.

## Como rodar

No Windows, dê dois cliques em `iniciar.bat`. Ele instala o que faltar, cria o banco na primeira vez e abre o navegador em http://localhost:5173. Para parar, feche a janela.

Requisitos: Node 22 ou mais novo e npm. Não precisa de Docker nem de banco instalado (dev usa SQLite).

```bash
npm install
```

```bash
node -e "require('fs').copyFileSync('apps/api/.env.example','apps/api/.env')"
```

```bash
npm run db:setup
```

```bash
npm run dev
```

Abra http://localhost:5173. Usuários de demonstração (criados pelo seed):

| Perfil | E-mail | Senha |
|---|---|---|
| Analista | analista@nayfiscal.dev | nay12345 |
| Administrador | admin@nayfiscal.dev | nay12345 |

O seed gera cerca de 580 NF-e sintéticas para 5 clientes e passa cada uma pelo mesmo caminho da importação real (parser + motor). Rodar `npm run db:setup` de novo apaga e recria os dados de demonstração.

## NFS-e (notas de serviço)

A Nay lê a NFS-e do padrão nacional (Emissor Nacional / Sefin) e o evento de cancelamento. Ela confere o código do serviço (LC 116), a alíquota do ISS (2% a 5%), o cálculo do ISS, o ISS em serviço sem tributação, o ISS de MEI, a retenção por pessoa física, o valor líquido e o grupo IBS/CBS. A tela NFS-e mostra as notas prestadas e tomadas, com os totais de ISS e de retenções.

Para testar, há 5 NFS-e de exemplo (tomador Empresa Exemplo) em `fixtures/xml/nfse/`: importe pela tela Importar. Para gerar de novo:

```bash
npm run exemplos:nfse -w @nay/api
```

Os XMLs de prefeituras que ainda usam leiaute próprio (ABRASF, Ginfes e outros) não são lidos nesta versão.

## Acesso pela internet (túnel Cloudflare)

Antes do primeiro túnel, troque as senhas de demonstração (o `tunnel.bat` se recusa a abrir enquanto alguma conta usar `nay12345`). A senha nova precisa ter 10 ou mais caracteres, com letras e números:

```bash
npm run senha -- admin@nayfiscal.dev <nova-senha>
```

```bash
npm run senha -- analista@nayfiscal.dev <outra-senha>
```

Depois dê dois cliques em `tunnel.bat`. Ele garante um segredo de sessão próprio em `apps\api\.env`, confere as senhas, compila o front e sobe a API na porta 3334 servindo o front já compilado (o servidor de desenvolvimento do Vite nunca fica exposto). Em seguida abre um túnel rápido da Cloudflare. O endereço `https://...trycloudflare.com` aparece na janela e muda a cada vez.

O túnel rápido não tem garantia de disponibilidade; para endereço fixo, use um túnel nomeado da Cloudflare (precisa de conta e `cloudflared tunnel login`).

## Segurança

- Sessão: o token de acesso (15 min) fica só na memória da aba; o de renovação (7 dias) fica num cookie `httpOnly`, `SameSite=Strict`, restrito a `/api/auth`. Trocar a senha (`npm run senha`) derruba todas as sessões abertas; `POST /api/auth/logout-all` faz o mesmo para o próprio usuário.
- Segredo: a API ignora `JWT_SECRET` vazio, curto (menos de 32 caracteres) ou público e usa um segredo aleatório temporário. `iniciar.bat` e `tunnel.bat` geram um segredo forte com `scripts/garantir-segredo.ps1`.
- Login: 5 senhas erradas seguidas bloqueiam a conta por 15 minutos, e cada IP tem 10 tentativas por minuto.
- Importação: até 20 arquivos e 100 MB por envio; XML até 5 MB, sem `DOCTYPE`/`ENTITY`; ZIP com no máximo 3.000 XMLs, 300 MB descompactados e taxa de compressão até 200:1 (bloqueia zip bomb).
- Saídas: o CSV neutraliza fórmulas vindas do XML (`=`, `+`, `-`, `@`), e o HTML da nota bloqueia scripts por CSP.
- Testes de ataque em `apps/api/test/security.test.ts` (`npm test`).

## Estrutura

```
apps/api      Fastify + Prisma (SQLite em dev; troque o provider para postgresql em produção)
  src/xml         leitura de NF-e, NFC-e, CT-e e evento de cancelamento
  src/engine      catálogo de regras e avaliador (modos: mapa_por_cfop, dominio_condicionado, ...)
  src/services    importação (XML/ZIP), auditoria, textos dos achados
  prisma/seed.ts  dados de demonstração
  test/           testes do parser e do motor (Vitest)
apps/web      React + Vite, estilos portados do mockup
packages/shared  tipos, telas/permissões e cálculo do simulador do Simples
```

## Testes

```bash
npm test
```

## O que já funciona

- Login com sessão renovável e perfis por tela (analista não vê Gestão).
- Importação de XML e ZIP com fila e progresso; cancelamentos (evento 110111).
- Notas, Auditoria (por regra, por nota, por fornecedor), drawer de diagnóstico com "Ver no XML", exportação XLSX e CSV.
- Início com o código de barras da carteira, Clientes, Simulador do Simples (tabelas reais dos Anexos I a III), Diagnóstico com respostas a partir dos achados.

## Próximas etapas

NFS-e (padrão nacional), Créditos de IBS/CBS por fornecedor, Ajuda, Gestão (usuários, perfis, regras), Diagnóstico com IA (Claude), leitura de SPED.
