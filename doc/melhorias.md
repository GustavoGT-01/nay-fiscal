# Melhorias necessárias — Nay Fiscal

Levantamento feito em 11/11/2026, após a reorganização em MVC. Cada item cita o arquivo de origem; os caminhos da API refletem a estrutura anterior (`routes.ts`, `ingest.ts`) e agora vivem em `apps/api/src/controllers`, `routes`, `services/ingest` e `models`.

## Alta prioridade (segurança e integridade dos dados)

> Atualizado em 12/11/2026 após a auditoria de segurança (`doc/auditoria-seguranca.md`): itens 1 a 6 resolvidos; 7 em parte.

1. ✅ **Segredo e CORS.** *(resolvido)* `JWT_SECRET` cai num valor fixo quando não definido, e o CORS aceita qualquer origem sem `WEB_ORIGIN` (`apps/api/src/config/env.ts`, `app.ts`). Fazer a API falhar ao subir sem segredo forte e fixar a origem permitida.
2. ✅ **Login e sessão.** *(resolvido: rate-limit, helmet, cookie httpOnly, tokenVersion)* Sem limite de tentativas nem `helmet`. O refresh token (7 dias) fica em `localStorage` e não pode ser revogado. Trocar a senha pelo script `senha.ts` não derruba sessões abertas. Adicionar rate-limit, cabeçalhos de segurança e revogação (versão de token por usuário).
3. ✅ **Rotas sem checagem de permissão.** *(resolvido para runs e uploads; notificações seguem só com login)* `GET /api/audit/runs/:id`, `GET /api/uploads/:id` e `/api/notifications` usam só `authenticate`, sem `can(...)`.
4. ✅ **ZIP sem limites.** *(resolvido, com fila única de importação)* O envio lê o ZIP inteiro em memória, sem limite de entradas nem de tamanho descompactado (risco de zip bomb). Limitar número de arquivos, tamanho por entrada e total (`services/ingest/zip.ts`).
5. ✅ **Dinheiro em `Float`.** *(resolvido: centavos `BigInt` no banco, conversão para reais só em `models/` via `lib/money.ts`; `unitValue`, `qty` e alíquotas seguem em `Float`. Bancos antigos precisam ser recriados com `npm run db:setup`)* Valores fiscais em `Float` acumulam erro de arredondamento (`schema.prisma`, modelo `Document` e itens). Migrar para centavos inteiros ou `Decimal`.
6. ✅ **Tarefas em segundo plano frágeis.** *(resolvido: tarefas presas viram ERRO ao reiniciar, o motivo do erro é gravado, só uma auditoria roda por cliente e a nota com seus itens grava numa transação, tratando importação concorrente da mesma chave)* Importação e auditoria rodam dentro do processo. Após um restart, o status fica em `PROCESSANDO`/`RODANDO` para sempre. O erro por arquivo é engolido, sem registrar o motivo, e o `upsert` do documento com seus itens não está em transação (`services/ingest/`).

## Média prioridade

7. ✅ **Validação de entrada.** *(resolvido em 25/11/2026: todos os parâmetros de URL passam por esquemas zod em `apps/api/src/lib/query.ts`; valor fora da lista dá 400; P2025 vira 404)* Query params usam `req.query as {...}` sem zod. Data inválida vira erro 500, `page` aceita negativo, e `findFirstOrThrow` responde 500 em vez de 404.
8. **Performance.** ◐ *(em parte, 25/11/2026; medido com 20 mil notas por `npm run bench`)* Feito: o painel calcula os totais no banco e manda só os últimos 15 dias para o gráfico (574 para 155 ms; resposta de 3,9 MB para 143 KB); os achados por regra são contados no banco (179 para 99 ms); `ruleMap()` e as regras ativas ficam em cache (invalidado ao subir); a importação lê cada XML uma vez, grava e audita sem reler a nota do banco, e o SQLite roda em modo WAL (de 84 para 178 notas/s; com o painel aberto durante a importação, a tela responde em ~170 ms em vez de ~550 ms, pior caso de 2,3 s para 0,18 s); índices novos desde 17/11/2026. Falta: o resumo de NFS-e ainda faz `JSON.parse` de cada nota (precisa de colunas novas, com os valores em centavos, e de migração); o XML ocupa a mesma linha da nota (tabela própria); exportação em fluxo, porque o CSV de 20 mil notas leva ~1 s e ~450 MB e o XLSX segura tudo na memória; busca por texto; lista de regras sem paginação.
9. ◐ **Testes.** *(em parte, 25/11/2026: `npm test` roda API, front e shared (150 testes); há teste de envio multipart, auditoria em segundo plano, leituras, exportação CSV/XLSX, CT-e, `present.ts`, simulador do Simples e componentes do front; CI no GitHub Actions e ESLint ativos; falta teste da contrapressão de 200 MB do envio, e o `build` da API segue `tsc --noEmit`)*
10. **Regras fiscais.**
    - O ISS é validado numa faixa fixa de 2% a 5% para qualquer município, sem tabela municipal.
    - Há datas diferentes para a Reforma Tributária: `INICIO_REFORMA` (NFS-e), 03/08/2026 (IBSCBS da NF-e) e datas fixas em `Shell.tsx` e `Inicio.tsx`. Centralizar em `packages/shared`.
    - Só lê o padrão nacional de NFS-e (ABRASF e Ginfes não são lidos); não valida assinatura nem protocolo.
    - CT-e gera um único item "FRETE" sem IBS/CBS.
    - A direção da nota (entrada/saída) sai só da raiz do CNPJ do emitente; incerta para CPF ou emissão de terceiros.
    - `'410999'` fixo no código para `cfop-cclasstrib-remessa`.
    - A regra de CSOSN do emitente foi removida na refatoração por nunca disparar; reimplementar só junto com o enriquecimento do cadastro (Simples Nacional).

## Baixa prioridade (UX e documentação)

11. Telas **Créditos** e **Ajuda** ainda são "Em breve". Notificações nunca são marcadas como lidas (`Notification.readAt` não é gravado). Estados de erro: resolvidos nas telas principais (25/11/2026; Início, Notas, NFS-e, Auditoria e Importar mostram a falha e deixam tentar de novo). O cliente padrão é buscado por `name.startsWith('Empresa')` (`session.tsx`). O "Diagnóstico IA" é um conjunto de regex; `ANTHROPIC_API_KEY` existe no `.env.example` mas não é usada. A animação de abertura (2,2 s) não pode ser pulada. Listas sem ordenação de colunas nem virtualização.
12. ✅ *(resolvido: o tunnel.bat recusa senhas de demonstração e não expõe mais o Vite)* A senha de demonstração aparece no eco do `iniciar.bat`. `tunnel.bat` expõe o servidor de desenvolvimento do Vite com usuários de demonstração; trocar as senhas antes de usar.

## Pendências operacionais

- `graphify-out/` segue fora do git (não rastreado). Decidir entre ignorar tudo ou versionar `graph.json` e `GRAPH_REPORT.md`.
- `graphify-out/.graphify_python` aponta para um ambiente Python em pasta temporária; recriar com `pip install graphifyy` num local permanente.
- Após o merge, rodar `npx prisma generate` e `npm run db:setup` em máquinas com banco antigo (as colunas `Client.simplesOptante` e `enrichedAt` foram removidas).
