# Auditoria de segurança — Nay Fiscal

Data: 12/11/2026. Base: commit `b03cc73`. Escopo: API (Fastify + Prisma), web (React + Vite), scripts `iniciar.bat`, `tunnel.bat` e `garantir-segredo.ps1`, e dependências.

Método: revisão manual do código, `npm audit` e testes de ataque automatizados (`apps/api/test/security.test.ts`). Depois, uma segunda revisão independente tentou contornar as correções. Ela achou 4 problemas nas primeiras versões das correções, e todos foram corrigidos.

Resultado: 66 testes passando (44 antigos e 22 de ataque). `npm audit --omit=dev` não aponta nenhuma vulnerabilidade.

## Falhas encontradas e corrigidas

| # | Gravidade | Falha | Ataque possível | Correção |
|---|---|---|---|---|
| 1 | Crítica | Senha de demonstração `nay12345` publicada no README, combinada com o túnel aberto na internet | Qualquer pessoa com o link entra como administrador e apaga ou exporta tudo | `tunnel.bat` roda `checar-senhas` e não abre o túnel enquanto alguma conta usar a senha de demonstração. `senha.ts` exige 10+ caracteres com letras e números |
| 2 | Crítica | `JWT_SECRET` caía em `dev-secret-nay-fiscal` e o `.env.example` trazia `troque-este-segredo`, os dois públicos | Forjar token de qualquer usuário | A API recusa segredo vazio, curto ou público e usa um segredo aleatório temporário. `iniciar.bat` e `tunnel.bat` geram um segredo forte com gerador criptográfico (o `Get-Random` foi trocado) |
| 3 | Crítica | Dependências vulneráveis: `fast-jwt` (via `@fastify/jwt` 9), `fast-xml-parser` 4, `zod` 3, `uuid` e `deepmerge-ts` | Contornar a validação de JWT, DoS | `@fastify/jwt` 10, `fast-xml-parser` 5, `zod` 4 e `overrides` para `uuid` e `deepmerge-ts`. Algoritmo fixado em HS256 |
| 4 | Alta | O túnel expunha o servidor de desenvolvimento do Vite, que tem histórico de CVEs de leitura de arquivos (`/@fs`) | Ler arquivos do computador | O túnel agora usa a API servindo o front compilado na porta 3334. O Vite só atende localhost |
| 5 | Alta | Login sem limite de tentativas | Força bruta de senha | Bloqueio por (conta + IP) após 5 erros, por 15 minutos, mais 10 tentativas por minuto por IP. Comparação em tempo constante quando o e-mail não existe |
| 6 | Alta | Refresh token de 7 dias no `localStorage`, sem como revogar | Um XSS rouba a sessão por uma semana. Trocar a senha não derrubava ninguém | Refresh token em cookie `httpOnly` + `SameSite=Strict` + `path=/api/auth`, girado a cada uso. Token de acesso só na memória. `tokenVersion` por usuário: `senha.ts` e `POST /api/auth/logout-all` derrubam todas as sessões |
| 7 | Alta | ZIP sem limites (zip bomb) e uploads de até 1 GB processados em paralelo na memória | Derrubar a API por falta de memória | Limites de entradas, de tamanho por XML, de taxa de compressão e de total descompactado, contados no fluxo real. 50 MB por envio. Fila única de importação e teto de 200 MB na fila |
| 8 | Alta | CORS aceitava qualquer origem sem `WEB_ORIGIN` | Outro site chamando a API | Origem fixa (`http://localhost:5173` por padrão) |
| 9 | Média | XML com `DOCTYPE`/`ENTITY` era aceito | Billion laughs e variações de XXE | XML com `DOCTYPE`/`ENTITY` é recusado; limite de 5 MB |
| 10 | Média | Injeção de fórmula no CSV: um nome de emitente `=HYPERLINK(...)` vindo do XML virava fórmula no Excel | Phishing e exfiltração pelo Excel de quem abre o relatório | Prefixo `'` em textos que começam com `= + - @` |
| 11 | Média | Sem cabeçalhos de segurança | Clickjacking, MIME sniffing | `@fastify/helmet` com CSP estrita. O HTML da nota tem CSP `script-src 'none'`. O script inline de tema virou `/theme.js` |
| 12 | Média | `GET /api/audit/runs/:id` e `GET /api/uploads/:id` sem checagem de permissão | Perfil sem acesso lendo dados | `can('auditoria')` e `can('importar')` |
| 13 | Média | Auditorias sem limite e exportação carregando o XML inteiro de cada achado | DoS de CPU e memória | Uma auditoria por cliente (409). Exportação sem a coluna `xml` e com teto de 50 mil linhas |
| 14 | Baixa | Data inválida, página negativa e `clientId` repetido davam erro 500; `findFirstOrThrow` também respondia 500 | Ruído e vazamento de comportamento | Validação devolve 400; registro inexistente devolve 404 |
| 15 | Baixa | Corpo JSON de até 60 MB | DoS | 1 MB (os arquivos vão pelo multipart, com limites próprios) |
| 16 | Baixa | Importações e auditorias ficavam em `PROCESSANDO`/`RODANDO` para sempre depois de um restart | Dados inconsistentes | Ao subir, essas tarefas viram `ERRO` com o motivo |
| 17 | Baixa | E-mail digitado no login ia para o log (às vezes é a senha digitada no campo errado) | Senha em log | O log registra só o IP |

Verificado e sem falha: isolamento entre escritórios (todo acesso por id é filtrado pelo `officeId`), escape do HTML da nota e ausência de `dangerouslySetInnerHTML`.

## Riscos que ficaram (decisão do negócio)

1. **Assinatura do XML não é verificada.** Quem tem `importar` pode enviar uma NF-e forjada com a chave de uma nota existente e sobrescrevê-la, ou enviar um evento de cancelamento falso. O risco fica dentro do próprio escritório. Opções: validar a assinatura XMLDSig e o protocolo, ou recusar sobrescrever nota com protocolo e registrar quem substituiu ou cancelou.
2. **"Sair" apaga o cookie, mas o refresh token antigo continua válido até expirar (7 dias)** se alguém o tiver copiado. Não há detecção de reuso. "Sair de todos" resolve; falta um botão na tela.
3. **O limite por IP confia no `CF-Connecting-IP`**, e só no modo túnel. Não exponha a porta da API direto na internet.
4. **`GET /api/clients` e `/api/notifications` não checam perfil**: qualquer usuário do escritório vê nomes e CNPJs dos clientes.
5. **O painel Início e as listas carregam tudo na memória.** Com mais de cerca de 100 mil notas por cliente, isso vira um problema de desempenho e disponibilidade.
6. **`vitest` 3** (ferramenta de teste, não vai para produção) tem avisos no `npm audit`. A atualização para a v4 esbarrou num erro do npm; fica para depois.
