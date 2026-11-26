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

## SPED Fiscal (só leitura)

Na tela Importar, um arquivo `.txt` de SPED Fiscal (EFD ICMS/IPI) é lido (registros 0000 e C100 de NF-e e NFC-e) e cruzado, pela chave de acesso, com as notas já importadas do cliente. O cruzamento aponta: valor ou ICMS diferente, operação (entrada/saída) diferente, situação diferente (cancelada de um lado só), nota do SPED sem XML importado e XML do período que não está no SPED. Nada nas notas é alterado, e o sistema não gera escrituração. O CNPJ do arquivo precisa ser do cliente (ou de um de seus estabelecimentos). Itens (C170) e analíticos (C190) ainda não são lidos. As divergências ficam na aba **SPED** da Auditoria (arquivo, totais por tipo e a lista, com clique para abrir a nota). A API expõe `GET /api/sped?clientId=` e `GET /api/sped/:id`.

## NFS-e (notas de serviço)

A Nay lê a NFS-e do padrão nacional (Emissor Nacional / Sefin) e o evento de cancelamento. Ela confere o código do serviço (LC 116), a alíquota do ISS (acima de 5% é erro; abaixo de 2% fica "a verificar", e a faixa de cada município pode ser cadastrada em `apps/api/src/engine/iss-municipal.ts`), o cálculo do ISS, o ISS em serviço sem tributação, o ISS de MEI, a retenção por pessoa física, o valor líquido e o grupo IBS/CBS. A tela NFS-e mostra as notas prestadas e tomadas, com os totais de ISS e de retenções.

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

## Desempenho

Para medir com um banco grande e descartável (gera as notas, cronometra as telas pesadas e importa um ZIP pelo caminho real; nunca toca no seu `dev.db`):

```bash
npm run bench -w @nay/api -- 20000 1000
```

O servidor liga o modo WAL do SQLite ao subir, para as telas não esperarem a importação gravar. O WAL cria os arquivos `.db-wal` e `.db-shm` ao lado do banco: para copiar o banco como backup, feche o app antes. `SQLITE_WAL=0` no `.env` desliga.

## Segurança

- Sessão: o token de acesso (15 min) fica só na memória da aba; o de renovação (7 dias) fica num cookie `httpOnly`, `SameSite=Strict`, restrito a `/api/auth`. Cada renovação gasta o token e entrega outro: se um token já gasto reaparece (fora de uma tolerância de 20 segundos para duas abas), aquela sessão é encerrada. "Sair" revoga a sessão no servidor; "Sair de todos os aparelhos" (menu do usuário) e a troca de senha derrubam todas.
- Segredo: a API ignora `JWT_SECRET` vazio, curto (menos de 32 caracteres) ou público e usa um segredo aleatório temporário. `iniciar.bat` e `tunnel.bat` geram um segredo forte com `scripts/garantir-segredo.ps1`.
- Login: 5 senhas erradas seguidas bloqueiam o par conta e IP por 15 minutos (guardado no banco, vale depois de reiniciar), e cada IP tem 10 tentativas por minuto. Senha definida pelo administrador só permite trocá-la: o resto da API responde 403 até a troca.
- Nota autorizada: um XML com a mesma chave e conteúdo ou protocolo diferente não sobrescreve a nota guardada, e nota cancelada não volta a valer por reimportação. Substituições, recusas e cancelamentos ficam em `DocumentEvent`, com quem enviou, e geram um aviso. Para trocar de propósito, apague a nota e importe de novo. A assinatura do XML **não** é conferida.
- Perfis: quem não tem a tela Clientes recebe a lista só para escolher o cliente (sem CNPJ, CNAE nem filiais) e não recebe avisos sobre o que não alcança.
- Importação: até 20 arquivos e 50 MB por envio (50 MB por arquivo); XML até 5 MB, sem `DOCTYPE`/`ENTITY`; ZIP com no máximo 3.000 XMLs, 150 MB descompactados e taxa de compressão até 200:1 (bloqueia zip bomb).
- Saídas: o CSV neutraliza fórmulas vindas do XML (`=`, `+`, `-`, `@`), e o HTML da nota bloqueia scripts por CSP.
- Testes de ataque em `apps/api/test/security.test.ts` e `hardening.test.ts` (`npm test`).

## Estrutura

```
apps/api      Fastify + Prisma (SQLite em dev; troque o provider para postgresql em produção)
  src/xml         leitura de NF-e, NFC-e, CT-e e evento de cancelamento
  src/engine      catálogo de regras e avaliador (modos: mapa_por_cfop, dominio_condicionado, ...)
  src/services    importação (XML/ZIP), auditoria, textos dos achados
  prisma/seed.ts  dados de demonstração
  test/           testes do parser e do motor (Vitest)
apps/web      React + Vite, estilos portados do mockup (scripts/gerar-estilos.mjs gera tokens.css e icons.css)
packages/shared  tipos, telas/permissões e cálculo do simulador do Simples
```

## Testes e qualidade

```bash
npm test
```

Roda a API, o front e o pacote `shared` (Vitest). Para conferir tipos e lint:

```bash
npm run typecheck
```

```bash
npm run lint
```

O mesmo conjunto (tipos, lint, testes e build do front) roda no GitHub Actions em cada push e pull request, em Linux e Windows (`.github/workflows/ci.yml`).

## O que já funciona

- Login com sessão renovável e perfis por tela (analista não vê Gestão).
- Importação de XML e ZIP com fila e progresso; cancelamentos (evento 110111).
- Notas, Auditoria (por regra, por nota, por fornecedor), drawer de diagnóstico com "Ver no XML", exportação XLSX e CSV.
- Início com o código de barras da carteira, Clientes, Simulador do Simples (tabelas reais dos Anexos I a III), Diagnóstico com respostas a partir dos achados.
- Notas com filtros de período, CFOP e modelo (etiquetas que se limpam uma a uma) e colunas que ordenam ao clique; a nota aberta fica no endereço (`?nota=`).
- Créditos: IBS e CBS das notas de entrada por veredito (pode creditar, em risco, não creditar), por fornecedor ou por mês, com exportação em CSV.
- Ajuda (perguntas frequentes, atalhos, glossário) e painel de avisos no sino, com leitura por pessoa.
- Gestão: usuários (criar, editar, desativar, senha provisória trocada no primeiro acesso) e perfis de acesso. Só administradores alteram; quem tem apenas a tela Gestão no perfil lê. "Trocar senha" fica no menu do usuário.

## Estilos e ícones

Cores, fontes e curvas vêm do `:root` de `design/nay-fiscal-mockup.html`; os ícones, do pacote Tabler, só os que o código cita. Depois de mudar o mockup ou usar um ícone novo:

```bash
npm run estilos -w @nay/web
```

`npm test` falha se `tokens.css` ou `icons.css` ficarem desatualizados, ou se um nome de ícone não existir. As telas de login e Início não têm mockup versionado em `design/`: a referência delas é o próprio código (`login.css`, `painel.css`).

## Próximas etapas

Gestão › Regras (ativar e desativar regras) e convite por e-mail, Diagnóstico com IA (Claude, depende da decisão sobre enviar dados fiscais à API), validação da assinatura do XML, tela do histórico de substituições e cancelamentos, e a leitura de C170/C190 no SPED.
