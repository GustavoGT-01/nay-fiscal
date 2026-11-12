# Melhorias necessárias — Nay Fiscal

Levantamento feito em 11/11/2026, após a reorganização em MVC. Cada item cita o arquivo de origem; os caminhos da API refletem a estrutura anterior (`routes.ts`, `ingest.ts`) e agora vivem em `apps/api/src/controllers`, `routes`, `services/ingest` e `models`.

## Alta prioridade (segurança e integridade dos dados)

> Atualizado em 12/11/2026 após a auditoria de segurança (`doc/auditoria-seguranca.md`): itens 1 a 4 resolvidos; 6 e 7 em parte.

1. ✅ **Segredo e CORS.** *(resolvido)* `JWT_SECRET` cai num valor fixo quando não definido, e o CORS aceita qualquer origem sem `WEB_ORIGIN` (`apps/api/src/config/env.ts`, `app.ts`). Fazer a API falhar ao subir sem segredo forte e fixar a origem permitida.
2. ✅ **Login e sessão.** *(resolvido: rate-limit, helmet, cookie httpOnly, tokenVersion)* Sem limite de tentativas nem `helmet`. O refresh token (7 dias) fica em `localStorage` e não pode ser revogado. Trocar a senha pelo script `senha.ts` não derruba sessões abertas. Adicionar rate-limit, cabeçalhos de segurança e revogação (versão de token por usuário).
3. ✅ **Rotas sem checagem de permissão.** *(resolvido para runs e uploads; notificações seguem só com login)* `GET /api/audit/runs/:id`, `GET /api/uploads/:id` e `/api/notifications` usam só `authenticate`, sem `can(...)`.
4. ✅ **ZIP sem limites.** *(resolvido, com fila única de importação)* O envio lê o ZIP inteiro em memória, sem limite de entradas nem de tamanho descompactado (risco de zip bomb). Limitar número de arquivos, tamanho por entrada e total (`services/ingest/zip.ts`).
5. **Dinheiro em `Float`.** Valores fiscais em `Float` acumulam erro de arredondamento (`schema.prisma`, modelo `Document` e itens). Migrar para centavos inteiros ou `Decimal`.
6. ◐ **Tarefas em segundo plano frágeis.** *(em parte: tarefas presas viram ERRO ao reiniciar, o motivo do erro é gravado e só uma auditoria roda por cliente; falta transação no upsert)* Importação e auditoria rodam dentro do processo. Após um restart, o status fica em `PROCESSANDO`/`RODANDO` para sempre. O erro por arquivo é engolido, sem registrar o motivo, e o `upsert` do documento com seus itens não está em transação (`services/ingest/`).

## Média prioridade

7. ◐ **Validação de entrada.** *(em parte: datas, página, tamanho e clientId validados; P2025 vira 404; falta zod nos demais query params)* Query params usam `req.query as {...}` sem zod. Data inválida vira erro 500, `page` aceita negativo, e `findFirstOrThrow` responde 500 em vez de 404.
8. **Performance.** Cada XML é lido duas vezes (importação e auditoria); `ruleMap()` e `rule.findMany()` rodam a cada requisição; o dashboard e a auditoria carregam tudo em memória; o `JSON.parse` do campo `nfse` roda em todas as linhas. Faltam índices em `Document(direction, verdict)` e `Finding(documentId, severity)`. Sem paginação em `/api/audit/export` e nas regras.
9. **Testes.** Não há teste das rotas de leitura, exportação XLSX/CSV, ZIP, `refresh`, `ingest`/`audit` nem da web. `npm test` na raiz só roda a API. Sem CI nem lint; o `build` da API é só `tsc --noEmit`.
10. **Regras fiscais.**
    - O ISS é validado numa faixa fixa de 2% a 5% para qualquer município, sem tabela municipal.
    - Há datas diferentes para a Reforma Tributária: `INICIO_REFORMA` (NFS-e), 03/08/2026 (IBSCBS da NF-e) e datas fixas em `Shell.tsx` e `Inicio.tsx`. Centralizar em `packages/shared`.
    - Só lê o padrão nacional de NFS-e (ABRASF e Ginfes não são lidos); não valida assinatura nem protocolo.
    - CT-e gera um único item "FRETE" sem IBS/CBS.
    - A direção da nota (entrada/saída) sai só da raiz do CNPJ do emitente; incerta para CPF ou emissão de terceiros.
    - `'410999'` fixo no código para `cfop-cclasstrib-remessa`.
    - A regra de CSOSN do emitente foi removida na refatoração por nunca disparar; reimplementar só junto com o enriquecimento do cadastro (Simples Nacional).

## Baixa prioridade (UX e documentação)

11. Telas **Créditos** e **Ajuda** ainda são "Em breve". Notificações nunca são marcadas como lidas (`Notification.readAt` não é gravado). Poucos estados de erro nas telas. O cliente padrão é buscado por `name.startsWith('Empresa')` (`session.tsx`). O PDF carrega fontes do Google (quebra offline). O "Diagnóstico IA" é um conjunto de regex; `ANTHROPIC_API_KEY` existe no `.env.example` mas não é usada. A animação de abertura (2,2 s) não pode ser pulada. Listas sem ordenação de colunas nem virtualização.
12. ✅ *(resolvido: o tunnel.bat recusa senhas de demonstração e não expõe mais o Vite)* A senha de demonstração aparece no eco do `iniciar.bat`. `tunnel.bat` expõe o servidor de desenvolvimento do Vite com usuários de demonstração; trocar as senhas antes de usar.

## Pendências operacionais

- `graphify-out/` segue fora do git (não rastreado). Decidir entre ignorar tudo ou versionar `graph.json` e `GRAPH_REPORT.md`.
- `graphify-out/.graphify_python` aponta para um ambiente Python em pasta temporária; recriar com `pip install graphifyy` num local permanente.
- Após o merge, rodar `npx prisma generate` e `npm run db:setup` em máquinas com banco antigo (as colunas `Client.simplesOptante` e `enrichedAt` foram removidas).
