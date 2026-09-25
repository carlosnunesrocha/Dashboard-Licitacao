# Progresso — Dashboard Kanban de Monitoramento de Licitações

> Atualizado em: 2026-09-25

## 🔜 Próxima sessão (segunda-feira)

**Retomar por aqui:** a página de Licitações (prospecção Compras MG) está
funcional só com **dados mock** — falta plugar a API real da Prodemge. É o
item mais rápido de destravar; o restante do backlog (board, PNCP, BNC,
coluna Documentação) está detalhado na seção seguinte e não mudou.

1. **Conseguir acesso à API "Transparência" da Prodemge.** O portal
   `api.prodemge.gov.br/store` exige conta + assinatura da API para liberar
   qualquer endpoint — tentei ler a documentação sem login e todos os
   caminhos responderam "API não autorizada". Passos:
   - Criar conta em `https://api.prodemge.gov.br/store/`.
   - Assinar a API **Transparência** (é a que expõe compras/licitações).
   - Gerar uma Application e o token de acesso (subscription key).
2. Com o token em mãos, me passar para eu trocar o mock em
   [compras-mg.adapter.ts](backend/src/integrations/compras-mg/compras-mg.adapter.ts)
   pela chamada HTTP real, já filtrando por MG e pelas 62 palavras-chave
   (ver `keywordList` em [LicitacoesPage.tsx](frontend/src/pages/LicitacoesPage.tsx)).
3. A documentação que consegui ler (sem token) descreve 4 endpoints da API:
   lista de fornecedores, lista de materiais/serviços, lista de itens de
   material/serviço, e lista de compras (este último aceita `Ano`
   obrigatório e filtros por órgão/material/item — não achei filtro de
   palavra-chave livre, então a filtragem por palavras-chave provavelmente
   terá que ser feita no nosso lado, sobre `nomeMaterialServico`).

## 🛒 Prospecção Compras MG — mock pronto para plugar a API real (2026-09-25)

Nova página **Licitações** deixou de ser "em construção": agora busca
oportunidades em `GET /integrations/compras-mg/oportunidades` e exibe em
[ExtendedLicitacaoCard.tsx](frontend/src/components/ExtendedLicitacaoCard.tsx) —
card mais largo que o do Kanban, em fila vertical, com órgão, badges, valor
estimado, objeto e modalidade/data no rodapé.

Filtro fixo pedido pelo usuário: só licitações de **Minas Gerais (MG)** e 62
palavras-chave de papelaria/material de expediente/material escolar (papel
a4, resma, chamex, caderno, cola, etc. — lista completa em
`keywordList` dentro de `LicitacoesPage.tsx`).

⚠️ **O adapter [compras-mg.adapter.ts](backend/src/integrations/compras-mg/compras-mg.adapter.ts)
está com 3 licitações mock**, no mesmo formato que a API real deveria
devolver. A API pública da Prodemge (`api.prodemge.gov.br`) barrou o acesso
sem cadastro — ver checklist acima antes de tentar de novo.

O adapter segue o mesmo contrato `PortalAdapter` dos outros portais (PNCP,
LicitarDigital, Caixa Escolar) e já está registrado em
[integrations.module.ts](backend/src/integrations/integrations.module.ts), então
trocar o mock pela chamada real não deve exigir mexer no resto do sistema.

## 🎨 Casca do app, navegação e tema (2026-09-24, commit `5023aff`)

O painel deixou de ser uma tela só. Agora há uma **casca persistente**
([AppLayout.tsx](frontend/src/components/layout/AppLayout.tsx)) com sidebar de
cinco seções — Dashboard, Licitações, Kanban, Relatórios, Configurações — cada
uma com ícone. **Recolhida, sobram só os ícones** (248px → 76px, estado em
`localStorage`).

A página antiga virou `KanbanPage` (é o que sempre foi). As outras quatro
nascem com casca e estado vazio — **Licitações, Relatórios e Settings são
intencionalmente vazias**, a definir com o usuário.

**Tema claro/escuro** por `data-theme` no `<html>`
([ThemeContext.tsx](frontend/src/context/ThemeContext.tsx)). Cores pedidas pelo
usuário: `#151515` na sidebar, `#282727` nas superfícies elevadas (modal).

⚠️ **O trabalho caro não foi o bloco dark — foi tokenizar os ~36 literais**
espalhados pelo CSS que não seguiriam a troca. Se for criar cor nova, **criar o
token junto**; literal solto vira texto ilegível no escuro.

⚠️ **Duas armadilhas de contraste, resolvidas por medição:**
1. **`--accent-strong` NÃO vira laranja puro no escuro.** Ele é cor de
   *superfície* com texto branco, e `#ff7e00` + branco dá **2.55:1** — o mesmo
   erro que o tema claro já evitava. Ficou `#ad5400` (5.19:1). O laranja puro
   foi para **`--accent-on-dark`**, para uso como *texto/glifo* (9.80:1).
   A regra: **superfície usa o tom escuro, primeiro plano usa o puro.**
2. Os campos do login ficavam brancos no escuro (literais `#fbfbfc`/`#cfccd6`).

⚠️ **O login NUNCA abre no escuro** — decisão do usuário. Tem identidade
própria (painel de marca escuro + formulário claro) e perderia contraste. A
`LoginPage` chama `forcarClaro(true)` enquanto montada; **a preferência da
pessoa continua salva** e volta a valer ao entrar. Os literais restantes no CSS
são todos desse painel, e é correto não seguirem o tema.

**Modal do card: 760px → 980px**, com cabeçalho fixo ao rolar (em conteúdo
longo o título e o fechar saíam de vista), superfície que materializa com
escala + desfoque, e `tabular-nums` nos valores para nossa proposta e a do
vencedor alinharem dígito a dígito.

Motion por CSS, não por mola: recolher a sidebar é **clique, não gesto**.
`prefers-reduced-motion` desliga deslizamento e escala mantendo as cores.

## 📋 Backlog anterior (board, PNCP, BNC, coluna Documentação)

1. **Board — muitas alterações** (continua sendo o grosso). O usuário traz a
   lista; ela não chegou em 23/09 porque o dia virou auditoria de dados.
   A identidade visual já está definida: seguir a tabela de tokens em
   "Identidade visual e tela de login" e **não** improvisar cores novas.
   ⚠️ O board carrega **todos os cards de uma vez, sem paginação nem filtro de
   data** ([DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx)). Em
   23/09: **991 cards no board, 940 deles em Resultado (95%)** — na prática um
   arquivo morto com quatro colunas de trabalho ao lado, e o número cresce a
   cada sync. Qualquer mudança que mexa em como as colunas são montadas ou
   renderizadas esbarra nisso primeiro.
2. **PNCP** — só se a operadora de licitações conseguir acessar o portal: o
   certificado digital estava com a contabilidade em 22/09. O que falta é uma
   verificação manual de 5 minutos em `pncp.gov.br` — existe **algum**
   contrato da Lucri publicado? Se não, o PNCP está encerrado (ver seção
   "PNCP por CNPJ", onde 18 mil contratos varridos deram zero).
3. **BNC** — parado por decisão: sem exportação e com reCAPTCHA por
   requisição, resta a entrada manual, que já está no ar.

### Dúvida em aberto: a coluna Documentação é necessária?

Levantada pelo usuário em 23/09, sem resposta ainda. O que os dados dizem:
**0 cards nela hoje**, e em 1.069 movimentações registradas apenas **4**
entraram lá — todas por `admin@exemplo.com`, o usuário de teste. Nenhum
adaptador coloca card em Documentação (a Caixa Escolar mapeia
`ENVI → Proposta enviada` e `APRO/RECU → Resultado`; o LicitarDigital omite o
status de propósito). O mesmo vale para **Em disputa**: 2 movimentações, ambas
de teste.

**Recomendação: remover** — aguardando resposta da operadora antes de agir
(decisão do usuário em 23/09, não mexer até lá).

O argumento não é "está vazia", é o propósito do painel: ele existe para
**diretoria e gerência acompanharem**, não para a operadora tocar o trabalho
dentro dele. Numa ferramenta de acompanhamento, uma coluna que nenhum portal
preenche só se enche se alguém lembrar de arrastar o card — e nada disso chega
a quem está olhando. E é estrutural: não existe caminho automático para
Documentação e não haverá, porque o BNC (único portal cujo mapa de status tinha
fases intermediárias) está encerrado.

**A pergunta que decide, e que é para a operadora:** *entre receber o edital e
enviar a proposta, existe uma etapa de juntar certidões que dura dias e que a
gerência precisa ver parada no board?* Se sim, a coluna se paga.

Mesmo nesse caso, ela só valeria para os **78 cards do LicitarDigital** — os da
Caixa Escolar chegam do sync já em Proposta Enviada e nunca passariam por lá.

Se for para mexer nas colunas, **decidir Em Disputa junto** em vez de reabrir o
assunto depois.

⚠️ Se for removida, **migrar os registros antes**: o board monta as colunas com
`columns[l.status]?.push(l)` ([KanbanBoard.tsx:84](frontend/src/components/KanbanBoard.tsx:84)),
e o `?.` faz card de status desconhecido **sumir da tela sem erro nenhum**.

## Objetivo do projeto

Centralizar em **um único painel** o acompanhamento das negociações/licitações
que a empresa já está participando em múltiplos portais, para que diretoria e
gerência não precisem abrir várias telas. **Não é** uma ferramenta de
prospecção/descoberta de oportunidades — isso já é feito por automação
própria da empresa.

Fluxo do Kanban: **Em análise → Documentação → Proposta enviada → Em
disputa/Julgamento → Resultado (Ganhou | Perdeu)**.

Stack: NestJS + Prisma (SQLite em dev / Postgres em prod) no backend, React +
Vite no frontend, deploy final em Docker Swarm num VPS próprio.

---

## ✅ Já concluído

### 1. Scaffolding inicial
- Backend NestJS criado em [backend/](backend/) com TypeScript, ESM (imports com `.js`).
- Frontend React + Vite criado em [frontend/](frontend/).
- Prisma configurado com SQLite para dev local (sem Docker Desktop disponível na máquina); trocar `provider` para `postgresql` no [schema.prisma](backend/prisma/schema.prisma) na hora do deploy.

### 2. Autenticação (JWT) e usuários
- Login/refresh token em [auth/](backend/src/auth/), guard JWT + guard de Roles aplicados globalmente (`APP_GUARD` no [app.module.ts](backend/src/app.module.ts)).
- Decorator `@Public()` para rotas abertas (login/refresh).
- Módulo `users` com CRUD e roles `admin`/`membro`.
- Seed do usuário admin inicial: [prisma/seed.ts](backend/prisma/seed.ts) (`admin@exemplo.com` / `admin123` — **trocar em produção**).

### 3. Modelo de dados e API de licitações
- Schema Prisma: `User`, `Licitacao`, `StatusHistory` — ver [schema.prisma](backend/prisma/schema.prisma).
- CRUD completo + filtros (status, portal, responsável, busca) em [licitacoes/](backend/src/licitacoes/).
- Endpoint `PATCH /licitacoes/:id/move` para mudar coluna do Kanban com histórico automático.
- `upsertFromIntegration` no [licitacoes.service.ts](backend/src/licitacoes/licitacoes.service.ts): usado pelos adaptadores para gravar/atualizar dados vindos dos portais **sem sobrescrever** status/responsável/observações definidos pela equipe — exceto quando o próprio portal já informa o andamento real (campo `statusSugerido`/`resultadoSugerido`).

### 4. Integração PNCP
- Adaptador em [integrations/pncp/pncp.adapter.ts](backend/src/integrations/pncp/pncp.adapter.ts).
- Usa a API pública de busca do PNCP (`https://pncp.gov.br/api/search/`), sem necessidade de credenciais.
- Job agendado a cada 6h em [jobs/sync.job.ts](backend/src/jobs/sync.job.ts).

### 5. Integração Caixa Escolar (parcial da tarefa "portais adicionais")
- Adaptador em [integrations/caixa-escolar/caixa-escolar.adapter.ts](backend/src/integrations/caixa-escolar/caixa-escolar.adapter.ts).
- Login via `POST https://api.caixaescolar.educacao.mg.gov.br/auth/login` com `{txCpfCnpj, txPassword}`, sessão mantida via cookie `sessionToken`.
- Dados via `GET /budget-proposal/summary-by-supplier-profile?filter.supplierStatus=$eq:<CODIGO>`.
- **Códigos de status do portal mapeados:**
  | Código portal | Significado no portal | Mapeado para (Kanban) |
  |---|---|---|
  | `ENVI` | Enviada | `PROPOSTA_ENVIADA` |
  | `APRO` | Aprovado | `RESULTADO` + `resultado: GANHOU` |
  | `RECU` | Recusado | `RESULTADO` + `resultado: PERDEU` |
  | `NAEN` | Não enviada | *ignorado* — é oportunidade geral, não negociação da empresa |
  | `FORA` | Prazo encerrado | *ignorado* — idem |
  | `CANC` | Cancelado | *ignorado* — idem |
- **Resultado do teste real:** 911 licitações importadas (20 enviadas, 207 ganhas, 684 perdidas).
- Credenciais no [.env](backend/.env) (`CAIXA_ESCOLAR_USER` / `CAIXA_ESCOLAR_PASS`) — **já preenchidas e testadas**.

---

## 🚧 Em andamento / próximos passos

### ⛔ Tarefa 5 — Login automatizado dos outros portais: BLOQUEADO (investigado em 2026-09-17)

Playwright **não** entra nesses portais. Não repetir essa investigação.

| Portal | Barreira de login automatizado |
|---|---|
| **LicitarDigital** (`minhaconta.licitardigital.com.br/oauth2/in/`) | Cloudflare anti-bot. Navegador automatizado recebe HTTP 403 ("Executando verificação de segurança") e o desafio não resolve nem após 60s. Nunca chega à tela de login. |
| **BNC Compras** (`bnccompras.com`) | **reCAPTCHA Enterprise** + **teclado virtual de senha** com botões ambíguos ("6 ou 0", "2 ou 1") — cada clique vale dois dígitos possíveis, por design anti-automação. |
| **BLL Compras** (`bllcompras.com`) | Mesma plataforma do BNC, barreiras idênticas. |

**Por que a Caixa Escolar funcionou e o login destes não:** ela expõe uma API REST com
login direto (`POST /auth/login` com `{txCpfCnpj, txPassword}`), sem captcha nem
teclado virtual.

**Achado sobre o LicitarDigital:** existe uma API em `api.licitardigital.com.br`
(NestJS — responde `{"response":{"statusCode":404,...},"name":"NotFoundException"}`)
que **não está atrás do Cloudflare**. Sem documentação pública e as rotas não são
adivinháveis (`/auth/login`, `/login`, `/oauth2/token` etc. todas 404). Caminho
viável: o usuário capturar as chamadas reais no próprio Chrome (F12 → Network após
login) e passar as rotas.

**Acesso público do BNC/BLL** (`/Process/ProcessSearchPublic?param1=0`): funciona
sem login e é legível, mas retorna o universo geral de licitações do país, sem
saber quais são da empresa. É prospecção — já coberta pela automação de e-mail —
então não serve ao propósito deste painel (ver [Objetivo do projeto](#objetivo-do-projeto)).

### 🎉 LicitarDigital — Cloudflare VENCIDO e login OK (2026-09-21)

O bloqueio de 17/09 **caiu**. O que o Playwright nunca passou (403, challenge
eterno), o pydoll passou em ~20s.

Receita que funcionou (ver [scripts/](scripts/)):
- `headless=False` — **obrigatório**. O Managed Challenge detecta headless e
  espera para sempre. Em Windows não precisa xvfb.
- `tab.expect_and_bypass_cloudflare_captcha()` em volta do `go_to`.
- `browser_preferences` com `last_engagement_time` antigo (perfil "usado").
- O aviso `Error in cloudflare bypass: Unable to resolve frameId` aparece mas
  **não é fatal** — o challenge resolve mesmo assim. Ignorar.

**Login é em 2 etapas** (País+CPF → senha). Seletores reais:

| Elemento | Seletor |
|---|---|
| CPF | `#username` |
| Avançar | `#next-button` |
| Senha | `#password` |
| Entrar | `#login` |

⚠️ **Não** usar `find(tag_name='button')` — pega o `navbar-toggler` invisível
e estoura `ElementNotVisible`.

**Rotas capturadas** (antes desconhecidas):
- `POST /oauth2/check-user-login` — etapa do CPF
- `POST /oauth2/request-login` — etapa da senha

Login confirmado: `/oauth2/in/` → `/oauth2/me/`.

**Fluxo completo até os dados (mapeado em 2026-09-21):**

1. `minhaconta.licitardigital.com.br` é **só o SSO**, não a plataforma.
2. Login: CPF (`#username` + `#next-button`) → senha (`#password` + `#login`) → `/oauth2/me/`.
3. Voltar a `/oauth2/in/` mostra o seletor de perfil `<select id="select_organization">`:
   - `common` / `data-type=citizen` → Cidadão
   - `provider` / `data-type=provider` / **`data-company="4709"`** → ARTEFATOS DE PAPEL LUCRI LTDA
   Selecionar `provider`, disparar `change`, clicar **AVANÇAR**.
   ⚠️ Nessa tela o AVANÇAR é `<button id="select_account">`, **não** `#next-button`.
4. Redireciona para `https://app2.licitardigital.com.br/painel-fornecedor`.

**API real: `manager-api.licitardigital.com.br`** — e **não** `api.licitardigital.com.br`,
que era o palpite de 17/09 (por isso todas as rotas davam 404). Header `Authorization`.

Endpoint da listagem:
```
POST https://manager-api.licitardigital.com.br/auction-notice/doSearchAuctionNotice
{"filter":{"supliesProviders":[],"shortFilter":"favorite","startDate":0,
 "startDatePublication":0,"isMarketplace":0},"offset":0}
```
`shortFilter` troca a visão: `favorite` | `proposal` | sugeridos. Paginação por
`offset`, **20 itens por página**. Resposta: `{status, data, meta}`.

Outros endpoints vistos: `users/getMe`, `providers/getProvider` (`{"id":0}`),
`auction-notice/getSearchResume`, `platforms/getPlatformContext`,
`supply-categories/listSupplyCategories`, `notifications/getNotificationsCount`.

**Campos de cada licitação:**
`id`, `auctionType`, `auctionNumber`, `accreditationNumber`, `auctionFinished`,
`startDateTimeDispute`, `methodDispute`, `simpleDescription`, `auctionStartDate`,
`auctionEndDate`, `organizationUnitId/Name`, `organizationId/Name`,
`biddingStageId`, `typeCancel`, `auctionCanceled`, `platform`,
`urlOriginalIcon`, `isFavorite`, `hasProposal`, `isSuggestion`.

**⚠️ Questão de escopo em aberto (decidir antes do adaptador):**
O usuário indicou que a empresa acompanha os leilões em **Favoritos**. Mas os
dados dizem que favoritar ≠ participar:

| Lista | Total | Observação |
|---|---|---|
| Seus favoritos | 29 | dos 20 da 1ª página, só **9** têm `hasProposal=true` |
| Propostas iniciadas | 67 | proposta efetivamente enviada |

Ou seja, 11 dos 20 favoritos são marcador/vigia, não negociação — exatamente o
tipo de prospecção que o painel exclui por definição. O filtro provável é
`hasProposal=true` (equivalente a `shortFilter: "proposal"`), ou
`isFavorite && hasProposal`. **Confirmar com o usuário.**

**Autenticação (OAuth2 authorization-code, mapeada em 2026-09-21):**

```
1. POST minhaconta/oauth2/check-user-login     (CPF)
2. POST minhaconta/oauth2/request-login        (senha)
3. seleciona perfil provider -> redirect para
   app2/oauth2/callback?redirectUri=painel-fornecedor&code=<CODE>&state=<UUID>
4. POST manager-api/auth/getTokenByCode        (troca code por token)
   -> {"status":"success","data":{"accessToken":"<JWT>",
       "typeAccess":"provider","companyId":4709,"user":{...}}}
5. front guarda em localStorage['_LDToken'] (335 chars)
```

**O JWT não tem `exp`.** Claims: `iat, idp, organizationId, priceBase,
providerId, requestAccessId, supportPin, typeAccess, userId`. Sem expiração
embutida → renovação **reativa** (401 → relogar), não por relógio. O
`providerId: 4709` vem dentro do token.

**⚠️ Cabeçalhos obrigatórios:** `Origin` + `Referer` + `User-Agent` de
navegador. Sem eles o Cloudflare devolve 403 "Acesso Restrito" antes de chegar
no app. Vale para o SSO e para o `manager-api`.

**⚠️ O `Authorization` exige o prefixo `Bearer`.** O JWT cru responde
`HTTP 400 {"message":"Token with invalid format","token":"TOKEN_MALFORMED"}`.

**⚠️⚠️ O cliente HTTP do Node é bloqueado — medido em 2026-09-21:**

| Cliente | Resultado |
|---|---|
| Python `urllib` | ✅ 201 |
| `curl` 8.21 | ✅ 201 |
| Node `fetch` (undici) | ❌ 403 desafio JS ("Just a moment") |
| Node `https` nativo | ❌ 403 |
| Node `https` + cifras/sigalgs de navegador | ❌ 403 |

Não é cabeçalho: as **mesmas cinco** variações de header passam no curl e
falham no Node. Ajustar `ciphers`/`sigalgs` não resolve — a diferença está na
construção do ClientHello (ordem de extensões, GREASE), fora do alcance da
config TLS do Node.

**Por isso o client usa `curl` via `execFile`**, com a URL e os cabeçalhos
passados por **stdin** (`curl --config -`), para o token não aparecer na lista
de processos. O navegador continua fora de produção; o pydoll é só ferramenta
de investigação local.

⚠️ **Revalidar no VPS antes do deploy:** o curl desta máquina usa Schannel
(Windows); em Linux ele usa OpenSSL e o fingerprint TLS muda. Se lá também for
bloqueado, as alternativas são `node-libcurl` ou um pequeno sidecar Python
(este último comprovadamente passa).

**Decisão de escopo (usuário, 2026-09-21): ganhou/perdeu é MANUAL.**
O portal do LicitarDigital **não expõe** o resultado da licitação — a
operadora atualiza pelo Kanban. Consequências para o adaptador:
- `resultadoSugerido` **nunca** é enviado (o dado não existe no portal).
- `statusSugerido` **também não**: se a operadora é dona do resultado, é dona
  do andamento, e `upsertFromIntegration` sobrescreve incondicionalmente
  quando o campo vem preenchido (`licitacoes.service.ts:296`), apagando o
  trabalho dela a cada sync de 6h.
- O adaptador é **importador puro**: traz a licitação em `EM_ANALISE`, a
  equipe conduz pelo board.

Por consequência, mapear `biddingStageId` (valores vistos: `9`, `10`, `11`)
deixou de ser necessário para a primeira versão.

### ✅ Adaptador LicitarDigital FUNCIONANDO (2026-09-21)

**Sync real executado com sucesso:**

```
1ª execução: { imported: 67, updated: 0,  desaparecidos: 0 }   6.3s
2ª execução: { imported: 0,  updated: 67, desaparecidos: 0 }   5.5s
```

A 2ª execução prova que a chave `portalOrigem_externalId` está correta e não
duplica. No banco: 67 linhas em `EM_ANALISE`, `resultado` nulo, 67 linhas de
`StatusHistory`, acentuação correta (`Unidade Única`, `aquisição`, `nº`) —
**`fixEncoding()` não é necessário** neste portal. A Caixa Escolar segue
intacta (17 + 929).

**Filtro em uso: `favorite` (29 registros).** Decisão do usuário: na operação
da empresa, os processos em que ela participa ou participou ficam registrados
em **Favoritos**. Esse é o critério do negócio.

Totais reais medidos com o token: `favorite` = 29, `proposal` = 67,
interseção = 18, união = 78.

Transição de `proposal` para `favorite` (sync de 2026-09-21):
`{ imported: 11, updated: 18, desaparecidos: 49 }` → 29 ativos no board.
Os 49 continuam no banco com `desaparecidoEm` preenchido (nada é apagado);
se voltarem à visão canônica, o upsert limpa a marca.

⚠️ **Não alternar a visão sem intenção:** `marcarDesaparecidos` escopa o
portal inteiro, então cada troca move dezenas de registros para dentro ou
fora do board de uma vez.

### ✅ Detalhes sob demanda do LicitarDigital (2026-09-21)

`PortalAdapter.fetchDetalhes` foi **generalizado**: recebia quatro inteiros do
domínio da Caixa Escolar (`idSubprogram, idSchool, idBudget, idSupplier`) e
agora recebe `LicitacaoParaDetalhes` — a licitação inteira. A validação dessas
chaves saiu de `IntegrationsService` (onde bloqueava todos os portais) para
dentro do adaptador da Caixa Escolar, que é quem precisa delas.

Antes de mexer, escritos **10 testes de regressão** da Caixa Escolar
([caixa-escolar.adapter.spec.ts](backend/src/integrations/caixa-escolar/caixa-escolar.adapter.spec.ts)),
que continuaram verdes depois da mudança.

Endpoints usados (`manager-api`, todos POST):
| Rota | Corpo | Devolve |
|---|---|---|
| `/auction-notice/getAuctionNoticeById` | `{auctionId}` | 39 campos do processo |
| `/auction-notice-lot/listLotsbyAuctionId` | `{params:{auctionId}}` | lotes |
| `/providers/getProviderById` | `{providerId}` | nome do vencedor |

⚠️ O envelope `params` é obrigatório na rota de lotes — sem ele, 422.

**O portal organiza por LOTE, não por item solto.** E um processo costuma ter
dois lotes do mesmo item: ampla concorrência (75%) e cota reservada ME/EPP
(25%), com **vencedores diferentes**. Por isso:
- `ordem` usa índice sequencial, não `lote.item` (que se repete);
- o vencedor de **cada** lote vai em `observacoes` — `empresaVencedora` só
  comporta um;
- `showReferenceValue = 0` é respeitado: o valor fica oculto, como no portal.

**Nossa proposta item a item não vem desta API** — vive em
`app.licitardigital.com.br`, ainda não mapeada. Por isso `valorTotalProposta`
é nulo e o modal, em vez de renderizar uma tabela de traços que pareceria
proposta em branco, mostra um aviso explicando a limitação
([LicitacaoModal.tsx](frontend/src/components/LicitacaoModal.tsx)).

### ❓ Em aberto: favoritos parecem ser POR USUÁRIO

O usuário relatou que o processo **79219** (inexigibilidade 035, processo 184,
Prefeitura Municipal de Três Marias) aparece em Favoritos no portal, mas ele
**não veio** no sync. Investigado em 2026-09-21:

- Com o token atual, a API responde para o 79219:
  `isFavorite: false`, `hasProposal: false`, `auctionFinished: 1`, `stage 11`.
- Ele não está em `favorite` (29) nem em `proposal` (67); só aparece na busca
  **sem filtro** (101.933 registros).
- Testado também `isMarketplace: 1` em ambas as visões → `count: 0`.

Hipótese: **`isFavorite` é por usuário, não por empresa.** O token é do
usuário `DEMETRIUS GRANATA PEREIRA` (`userId 6119`), perfil provider da
empresa `4709`. Se quem favoritou foi outro login da empresa, o favorito não
existe para este token.

Como confirmar, no navegador que enxerga o 79219 em Favoritos:
```js
JSON.parse(atob(localStorage.getItem('_LDToken').split('.')[1]))
```
Se `userId` ≠ 6119, está confirmado — e a correção é usar o token daquela
conta, ou consolidar os favoritos num usuário só.



Arquivos novos:
- [licitar-digital.client.ts](backend/src/integrations/licitar-digital/licitar-digital.client.ts)
  — fala com o `manager-api`. Os cabeçalhos de navegador (`Origin`, `Referer`,
  `User-Agent`, `Accept`) estão centralizados em `BROWSER_HEADERS`; **remover
  qualquer um quebra tudo com 403 silencioso**.
- [licitar-digital.adapter.ts](backend/src/integrations/licitar-digital/licitar-digital.adapter.ts)
  — implementa `PortalAdapter`, pagina de 20 em 20 por `offset`, e tem
  `verificarEscopo()` como **fail-closed**: aborta se `meta.count` passar de
  5.000 ou se algum item vier sem a flag da empresa. Sem isso, um token
  inválido faria o sync despejar ~101 mil editais públicos no board.
- Registrado em [integrations.module.ts](backend/src/integrations/integrations.module.ts)
  (nos `providers` **e** na `useFactory`/`inject` do `PORTAL_ADAPTERS`).

- [licitar-digital.adapter.spec.ts](backend/src/integrations/licitar-digital/licitar-digital.adapter.spec.ts)
  — **16 testes**, primeiro teste unitário do projeto (só havia o e2e). Focados
  nas guardas, não no caminho feliz: universo público, item fora do filtro,
  resposta vazia, página parcial, paginação, cabeçalhos do WAF, omissão de
  `statusSugerido`, campos nulos, 401.

`statusSugerido` e `resultadoSugerido` são **omitidos de propósito** — ver a
decisão de escopo acima. O adaptador é importador puro.

**Bug pego pelos testes:** o laço somava 20 fixo ao `offset`. Se o portal
devolvesse uma página parcial antes do fim, registros eram pulados — e depois
marcados como desaparecidos por `marcarDesaparecidos`. Agora avança por
`pagina.data.length`, e página vazia com `offset < total` aborta o sync.

**Autenticação nesta versão:** o token vem de `LICITAR_DIGITAL_TOKEN` no `.env`,
obtido manualmente via `localStorage.getItem("_LDToken")` no Chrome do usuário.
Isso é possível porque o JWT não tem `exp`. O login automatizado em HTTP puro
fica para depois: faltam os corpos de `POST /oauth2/check-user-login` e
`POST /oauth2/request-login`, e a URL completa de
`GET /oauth2/authorize/4709/?client_id=php-manager&response_type=...`.

⚠️ **O portal passou a recusar o login automatizado na tarde de 2026-09-21**
após ~8 logins seguidos — três tentativas travaram entre o CPF e a senha, com
o mesmo código que funcionara antes. Provável throttling. **Não insistir**;
capturar o que falta pelo Chrome do próprio usuário (F12), que não gera carga
extra no portal.

Scripts em [scripts/](scripts/): `licitardigital_probe.py` (só Cloudflare),
`licitardigital_inspect.py` (DOM do login), `licitardigital_login.py` (login),
`licitardigital_contas.py` (seletor de perfil), `licitardigital_painel.py`
(painel + rede), `licitardigital_favoritos.py` (API + corpo da resposta),
`licitardigital_token.py` (fluxo OAuth2 + claims do JWT).

**Nota técnica:** `execute_script` do pydoll **não** aguarda Promise (sem
`awaitPromise`), então replay via `fetch` async retorna `undefined`. Para ler
corpo de resposta use `tab.get_network_response_body(requestId)` com o
`requestId` vindo de `NetworkEvent.RESPONSE_RECEIVED`.

### 🧪 Skill pydoll-antibot-bypasser instalada (2026-09-21)

Plugin `pydoll-antibot-bypasser@pydoll-cf-waf-bypasser-skills`
(github.com/Esonhugh/pydoll-cf-waf-bypasser-skills) instalado via:

```bash
claude plugin marketplace add Esonhugh/pydoll-cf-waf-bypasser-skills
claude plugin install pydoll-antibot-bypasser@pydoll-cf-waf-bypasser-skills
```

É **só skill** (SKILL.md + exemplos Python + doc de anti-detecção; sem hooks,
sem MCP server). Usa CDP direto, sem webdriver, com tratamento de Turnstile.

**Pendente:** `pip install pydoll-python` (não estava no Python 3.13.0 da
máquina) + reiniciar a sessão para a skill carregar.

**Onde aplicar — e onde não:**

| Portal | Barreira | Chance com pydoll |
|---|---|---|
| **LicitarDigital** | Cloudflare puro (403) | **Boa** — é o caso de uso da skill |
| **BNC / BLL** | reCAPTCHA Enterprise **+ teclado virtual ambíguo** | **Parcial** — resolve o captcha, não o teclado |

O teclado virtual do BNC não é detecção de bot: cada botão vale dois dígitos
("6 ou 0"). Nenhum bypasser de WAF muda isso. Por isso a skill **não** abre o
BNC — ver a seção de recomeço abaixo.

### 🔄 BNC e BLL — recomeço em 2026-09-22

**A trilha da "chave de acesso" foi abandonada** a pedido do usuário. A chave
gerada em 18/09 foi revogada e **nunca chegou a ser usada** (nunca foi colada
no chat, nunca entrou no repositório). Não retomar esse assunto por conta
própria — se voltar, virá do usuário.

**Situação:** o usuário está levantando **com a operadora da empresa** como se
chega, na área logada do BNC, às licitações já encaminhadas — e trará esse
caminho (telas, URLs, como a lista é montada). O trabalho recomeça a partir
desse material.

#### Reconhecimento externo concluído em 2026-09-22 (não repetir)

Tudo que dá para medir de fora, sem sessão, já foi medido:

| O quê | Resultado |
|---|---|
| Plataforma | **ASP.NET MVC clássico**, IIS/10.0, HTML no servidor — **não é SPA** |
| Bundle JS (`/bundles/JS`, 1 MB) | Só jQuery/DataTables. Rotas próprias: apenas `/Home/GeneratePassword` e `/Home/GetTimeNow`. Zero `integration`/`apikey`/`accesskey` |
| Subdomínios de API | `api.` `integracao.` `ws.` `webservice.` `integration.` `apiintegracao.` + `api.bnc.org.br` → **todos sem DNS** |
| Cloudflare | **Não é barreira** — `curl` anônimo passa em tudo. A barreira é só a sessão |
| Rota de dados pública | `POST /Process/GetProcessByParams` (GET → 404; sem sessão → 302 login) |
| Parâmetro `token` dessa rota | É **reCAPTCHA** (`ExecuteCaptcha('publicSearch')`), não credencial |

Outras rotas vistas no HTML: `/Process/ProcessView`,
`/Process/ProcessSearchPublicByLocation`, `/DirectBuy/DirectBuySearchPublic`,
`/Home/ShowProfiles`, `/Home/UserSessions`,
`/SignFile/GetPendentSignsByPerson`.

**Conclusão:** como o BNC não é SPA, a receita que destravou o LicitarDigital
(ler as rotas do bundle JS) **não se aplica**. O que falta é informação
interna — daí depender da operadora.

#### 🎯 Achado da operadora (2026-09-22): a tela certa é `/Proposal/ProposalSearch`

A operadora indicou o caminho real: **`https://bnccompras.com/Proposal/ProposalSearch`**
— a área **das propostas da empresa**, não a busca pública. É o escopo que o
painel precisa.

**Rota de dados descoberta a partir daí:** `POST /Proposal/GetProposalsByParams`
(GET → 404; sem sessão → 302 para
`/Base/DataResult?message=Você não está autenticado...`). Ou seja: **a rota
existe, é POST e é protegida por sessão** — o 302 prova que ela reconhece
autenticação, ao contrário dos chutes de 17/09 que davam 404.

Formulário da tela (IDs = nomes dos parâmetros, padrão ASP.NET MVC model binding):

| Campo | `id`/`name` | Observação |
|---|---|---|
| Modalidade | `fkModality` | 1 PREGÃO ELETRÔNICO · 3 DISPENSA ELETRÔNICA · 4 CONCORRÊNCIA ELETRÔNICA · 5 LEILÃO · 6 REGIME DIF. DE COMPRAS · 7 SELEÇÃO SESI/SENAI · 10 LICITAÇÃO 13.303 · 11 CREDENCIAMENTO · 12 SELEÇÃO PÚBLICA |
| Situação | `fkStatus` | 2 GRAVADO · 3 PUBLICADO · 4 RECEPÇÃO DE PROPOSTAS · 49 AGUARDANDO DISPUTA · 5 DESERTO · 6 ANÁLISE DE PROPOSTAS · 7 DISPUTA · 16 HABILITAÇÃO · 23 ADJUDICADO · 24 HOMOLOGADO · 25 CANCELADO · 26 FRACASSADO · 27 SUSPENSO · 28 REVOGADO · 29 ANULADO · 30 EM RETIFICAÇÃO · 41 JULGAMENTO · 47 RESULTADO FINAL |
| Início | `DateStart` | formato `dd/MM/yyyy HH:mm:ss` |
| Fim | `DateEnd` | idem |

**Mapeamento provável para o Kanban** (confirmar com dados reais):
`4`/`49` → PROPOSTA_ENVIADA · `6`/`7`/`16`/`41` → EM_DISPUTA ·
`23`/`24`/`47` → RESULTADO · `5`/`25`/`26`/`28`/`29` → encerrados sem
resultado nosso. **Atenção:** "HOMOLOGADO" é o desfecho *do processo*, não
necessariamente vitória **nossa** — ver questão em aberto abaixo.

⚠️ **A busca da operadora com `fkModality=1` + `fkStatus=24` (PREGÃO
ELETRÔNICO + HOMOLOGADO) nos últimos 6 meses não retornou nada.** Hipóteses,
em ordem de probabilidade: (a) a janela de datas usa a data errada
(publicação vs. disputa vs. homologação); (b) a empresa participa por outra
modalidade (DISPENSA ELETRÔNICA é comum); (c) a tela lista só propostas em
aberto e o histórico vive em outra aba; (d) HOMOLOGADO não é o estado final
visível ao fornecedor. **Testar outras combinações antes de concluir
qualquer coisa** — começar sem filtro de situação, janela curta.

#### 🧪 Teste com cookie de sessão real (2026-09-22) — ⛔ barrado por reCAPTCHA

O usuário copiou o cookie do navegador logado para `BNC_COMPRAS_COOKIE` no
`.env` e a sonda ([scripts/bnc_sonda.sh](scripts/bnc_sonda.sh)) rodou contra a
rota real. Resultado em duas partes:

**✅ O cookie autentica.** `GET /Proposal/ProposalSearch` com ele devolve
**HTTP 200** e a página logada inteira (33 KB). O cookie é simples, um só:
`BNC=<hex de ~2 KB>`. Sessão não foi obstáculo.

**⛔ Mas a rota de dados exige reCAPTCHA.** O POST devolve **302** para
`/Base/DataResult?message=Captcha inválido`. Não é expiração — é validação de
captcha, num passo depois da autenticação.

Lendo o JS da página logada, o mecanismo é:

```js
ExecuteCaptcha('getProposals').then(function (token) {
    $.ajax({ type: "Post",
      url: '/Proposal/GetProposalsByParams?...&token=' + token, ... })
})
```

**reCAPTCHA v3 invisível**, sitekey `6LestvomAAAAAG9MNzlBaMEufF1QLdpKoL48qGsq`,
action `getProposals`. O token é gerado no navegador, é de uso único e vale
~2 minutos. **Nenhum cookie copiado contorna isso** — e é a mesma trava da
busca pública (lá a action é `publicSearch`).

**Correções aos parâmetros** (o palpite anterior estava errado em dois pontos,
conferido no JS real):
- As datas se chamam **`creationStart`/`creationEnd`**. `DateStart`/`DateEnd`
  são só os `id` dos inputs na tela.
- Tudo vai na **query string**, não no corpo. `contentType` é
  `application/json`, mas o corpo vai vazio.
- A lista completa: `Organization`, `Number`, `City`, `fkModality`,
  `fkStatus`, `creationStart`, `creationEnd`, `Offset`, `token`.
- Paginação: `Offset` é **número de página** (o "carregar mais" faz
  `offset = parseInt($('#Offset').val(), 10) + 1`), não deslocamento de itens.
- Resposta esperada: `dataType: "json"`, com `data.html` dentro — ou seja,
  **JSON envelopando HTML renderizado**. O adaptador vai precisar de parse de
  HTML das linhas `<tr>`.

**⛔ Conclusão: sync automático do BNC é inviável por esta via.** O reCAPTCHA
v3 é por requisição e depende de execução de JS no navegador. Copiar cookie
não resolve; copiar token também não (expira em ~2 min).

**E não há exportação.** O usuário verificou a tela em 2026-09-22: não existe
botão de baixar arquivo em nenhum formato. Isso elimina o importador de
planilha, que era o caminho mais curto.

**Situação final do BNC (2026-09-22):** as três portas estão fechadas —
login automatizado (reCAPTCHA + teclado virtual), API HTTP com cookie
(reCAPTCHA por requisição) e exportação de arquivo (não existe). O que resta:

1. **Entrada manual** no painel para os processos do BNC — os campos já
   existem; falta só uma tela de cadastro no frontend. É a única via que não
   depende de nada do lado do portal. **Recomendado.**
2. **pydoll dirigindo o navegador logado** — o captcha é v3 invisível (sem
   clique), então rodaria com a sessão já aberta. Mas o login continua
   bloqueado pelo teclado virtual, exigindo intervenção humana periódica.
   Frágil para produção; considerar só se o volume do BNC justificar.
3. **API oficial de parceiro** — suporte (42) 3026-4555. Única via estável e
   de baixo esforço nosso, mas depende de o portal aceitar um fornecedor no
   programa (os parceiros conhecidos são empresas de automação).

⚠️ **Não reabrir** a investigação técnica do BNC sem que algo mude do lado
deles. Está medido: cookie autentica (200 na página), rota existe e responde,
e o captcha barra. Não é falta de tentativa.

⚠️ **Não reabrir:** busca web por documentação do BNC (já feita, nada útil);
Playwright/pydoll no login (reCAPTCHA Enterprise + teclado virtual ambíguo —
barreira deliberada); chute de subdomínio ou de rota.

**Critério de sucesso (inalterado):** só vale se expuser as licitações **da
empresa**. O `/Process/ProcessSearchPublic` é acessível sem login mas devolve
o universo geral de editais — prospecção, fora do escopo.

**Fallbacks:** (a) suporte BNC Atendimento Fornecedores (42) 3026-4555;
(b) entrada manual no painel; (c) importador de planilha.

BLL usa a mesma plataforma do BNC: resolver um resolve os dois.

### 🎨 Identidade visual e tela de login (2026-09-22)

Skills instaladas e usadas: `apple-design`, `transitions.dev`, `emilkowalski`.

**Paleta da marca LUCRI.** Cores amostradas com canvas, não estimadas:

| Token | Valor | Onde | Por quê |
|---|---|---|---|
| `--accent` | `#ff7e00` | ícones, foco, halo, headline | laranja da referência do usuário; 7.54:1 sobre o painel escuro |
| `--accent-strong` | `#a85200` | `.btn-primary`, `.btn-link`, avatar | laranja puro com texto branco dá **2.55:1** — ilegível. Este dá 5.42:1 |
| `--brand-red` | `#d40f00` | **só** o botão Entrar | único ponto vermelho da tela; 5.43:1 |
| `--danger` | `#a01f4a` | erros, badge "Perdeu" | era `#d1332f`, quase idêntico ao vermelho de marca: "Perdeu" e "+ Nova licitação" liam como a mesma coisa. Vinho separa **cor de marca de cor de estado** |

⚠️ **Não trocar `--accent` por `--accent-strong` (ou vice-versa) sem verificar
contraste.** A regra: superfície que carrega texto branco usa o tom escuro;
glifo/borda/foco sobre fundo escuro usa o puro.

**Tela de login redesenhada** ([LoginPage.tsx](frontend/src/pages/LoginPage.tsx)):
split 50/50, painel escuro (`#100d18`) à esquerda com headline, quatro cartões
de feature e rodapé-selo; formulário centralizado à direita.

Decisões que não são estéticas:
- **Espaço reservado para o erro** (`.login-error-slot`, `min-height`): sem
  isso a mensagem empurra o botão para baixo no instante em que a pessoa vai
  clicar de novo.
- **Tracking negativo** (`-0.03em`) nos títulos grandes — texto grande com
  espaçamento padrão parece solto (regra da `apple-design`).
- **Resposta no pressionar** (`:active` com `scale(0.985)`), não no soltar.
- **`prefers-reduced-motion`** desliga a entrada escalonada dos cartões.
- Abaixo de 900px o painel some — ele empurraria o formulário para fora da
  dobra, e o formulário é o motivo da visita.

**Logos:** `logo-lucri-white.png` (fundo escuro) e `logo-lucri-dark.png`
(fundo claro) estão em `frontend/src/assets/`, mas **não são importadas** — o
usuário preferiu o texto "Painel de Licitações". Como não há import, não
entram no build; ficam prontas se mudar de ideia. Originais em
`frontend/imagens/`.

### 📊 Dados prontos para o dashboard (2026-09-23)

O dia começou com uma pergunta do usuário — "os cards têm data de modificação e
valor?" — e a resposta foi não, num grau que inviabilizaria o dashboard.

#### A auditoria

| Campo | Caixa Escolar (964) | LicitarDigital (78) |
|---|---|---|
| `valorEstimado` | **0%** | **0%** |
| `valorTotalProposta` | **36 (4%)** | **0%** |
| `dataAbertura` | 100% | 100% |
| `dataLimite` | 100% | **0%** |

Os 36 com valor eram exatamente os 36 com `detalhesSincronizadosEm`: **o valor
só entrava no banco quando alguém clicava no card.** Um dashboard sobre essa
base mediria 4% da realidade.

#### ⚠️ Armadilhas confirmadas (não repetir a investigação)

**`estimatedValue` NÃO é o valor da compra.** O endpoint `budget` devolve esse
campo em 100% dos cards e o adaptador nunca gravou — parecia omissão a
corrigir. Conferido contra propostas conhecidas antes de mapear:

| Card | Nossa proposta | `estimatedValue` |
|---|---|---|
| 367424 | R$ 8.163,89 | 274,00 |
| 365409 | R$ 5.812,50 | 25,00 |
| 173636 | R$ 5.493,60 | 24,00 |

É outra coisa (unitário ou quantidade). Mapeá-lo pelo nome daria ao painel um
número errado com cara de certo. **Deixado de fora de propósito.**

**Não existe data de decisão na API da Caixa Escolar.** O único candidato era
`dtJustification` — **nula em 12 de 12** cards sondados, e o endpoint de
propostas não tem data nenhuma. Sonda em
[scripts/caixa_sonda_lote.mjs](scripts/caixa_sonda_lote.mjs).

**`dataAbertura` e `dataLimite` significam coisas diferentes em cada portal:**
`dtProposalSubmission`/`dtDelivery` na Caixa Escolar (envio da proposta e
entrega do serviço), `auctionStartDate`/`auctionEndDate` no LicitarDigital
(sessão do pregão). **Não servem de filtro comparável entre portais.**

#### O que foi feito (commit `f0365fb`)

- **`dataProposta` e `dataResultado`** como campos próprios, normalizados entre
  portais — é por eles que o dashboard filtra. `dataProposta` já nasceu
  preenchida nos 964 cards da Caixa Escolar: a migração copia de
  `dataAbertura`, que sempre foi `dtProposalSubmission` ali. Zero requisições.
- **`dataResultado` só é carimbada quando o resultado APARECE** num card que já
  acompanhávamos sem resultado. Card que chega já resolvido fica nulo — a
  decisão é anterior a nós. Sem essa regra, os 891 importados em 14/09 seriam
  carimbados de uma vez e o relatório mostraria 891 resultados no mesmo dia.
- **Proposta digitada à mão** no LicitarDigital (a API do painel não a expõe;
  ela vive em `app.licitardigital.com.br`, host não mapeado), com marcas
  `valorPropostaManual`/`dataPropostaManual`. A marca **é a trava** que impede o
  sync de detalhes — que ali devolve `null` — de apagar o que foi digitado.
  Limpar o campo derruba a marca junto.
- **Índices** em `dataProposta`, `dataResultado`, `status+resultado`,
  `portalOrigem+status`, `desaparecidoEm`.

#### Backfill de detalhes (commit `b195db5`)

Os detalhes deixaram de depender do clique. **Resultado: 966 de 973 cards da
Caixa Escolar com valor (99%)**, contra 36 (4%).

```bash
node scripts/backfill_detalhes.mjs caixa-escolar 50 1500
```

**O ritmo lento é o recurso, não o defeito.** Cada card custa 3 requisições;
em rajada seria indistinguível de ataque. Pausa de 1,5s com jitter de ±20%.

⚠️ **Três armadilhas que já custaram uma execução cada:**
1. **Não rodar `npm test` nem salvar arquivo do backend com o backfill em
   andamento** — o `nest --watch` reinicia a aplicação e derruba a conexão. O
   script agora espera e refaz o lote, mas perde tempo.
2. **O access token vale 15 min** e a carga leva 30+. O login é refeito a cada
   lote por isso.
3. **Lotes, não chamada única** — 35 min numa requisição HTTP morre em timeout.

#### ⚠️ Detalhe buscado ≠ detalhe completo

Um card em Perdeu **sem `empresaVencedora`** foi buscado enquanto o orçamento
ainda estava em análise no portal (`budget.status = ANAP`): ali
`idSupplierProposalWinner` é nulo e a lista de concorrentes responde **404** —
ela só passa a existir depois que a escola conclui. *"Nossa proposta foi
recusada"* chega antes de *"a escola escolheu com quem fica"*.

Como `detalhesSincronizadosEm` já ficava carimbado, esses cards **congelavam**:
o vencedor apareceria no portal e nunca chegaria ao painel. Agora contam como
detalhe incompleto (`DETALHES_INCOMPLETOS` em
[licitacoes.service.ts](backend/src/licitacoes/licitacoes.service.ts)), tanto na
fila quanto na abertura do card. Dos 5 cards nesse estado, **3 já tinham
vencedor publicado** que nunca teria chegado.

### 🔍 Ícones do login (2026-09-23)

Os ícones do painel lateral pareciam desfocados. **A causa era escala
fracionária, não tamanho:** `viewBox="0 0 24 24"` renderizado a 22px dá fator
0,9167, e toda coordenada inteira do desenho caía em fração de pixel
(`x="3"` → 2,75), fazendo o navegador antialiasar a silhueta inteira.

Glifo agora em **35px** dentro do tile original de 44px. 36px (1,5×) seria o
valor matematicamente nítido, mas sufocava o tile — sobravam 4px de folga. 35px
é fracionário (1,4583×), porém com o desenho já grande o antialiasing pesa
pouco: **o usuário validou na tela em 23/09 e está nítido.** Ao mexer: abaixo
daqui só 24px é nítido, e acima 36px pede o tile em 46px para não sufocar.

Observação não resolvida: os ícones ímpares são laranja sobre fundo laranja
translúcido — mesma família de cor no glifo e no fundo também tira definição,
independente do tamanho.

### ✅ Tarefa 6 — Frontend: Kanban e autenticação (CONCLUÍDA)
- Login + rota protegida, sessão via JWT em `localStorage` com refresh automático em 401 ([api/client.ts](frontend/src/api/client.ts)).
- Board em React + `@dnd-kit` com **5 fases**: Em Análise → Documentação → Proposta Enviada → Em Disputa → **Resultado**.
- A coluna **Resultado** tem título mesclado sobre duas sub-colunas (**Ganhou | Perdeu**), cada uma um droppable próprio — soltar o card já define o `resultado`, sem diálogo extra ([KanbanResultadoColumn.tsx](frontend/src/components/KanbanResultadoColumn.tsx)).
- Card enxuto: apenas badge do portal, instituição e objeto (demais dados no modal).
- Modal do card com os detalhes reais do portal: **1)** detalhamento da solicitação, **2)** itens solicitados (un./qtd./valor de referência), **3)** nossa proposta por item (valor unitário, total, observações, garantia ofertada) + valor total do orçamento. Quando `resultado = PERDEU`, mostra bloco comparativo: nossa proposta vs. nome e valor da empresa vencedora.
- Filtros por portal, responsável e busca (debounce).

### Detalhes — como funciona (atualizado em 23/09)

`GET /api/integrations/detalhes/:licitacaoId` — busca no portal, persiste no
banco (`LicitacaoItem` + campos de detalhe em `Licitacao`) e retorna; nas
próximas vem direto do banco.

⚠️ **Não é mais só sob demanda.** O desenho original evitava as ~2.700
requisições esperando o clique da operadora — mas isso deixava 96% dos cards
sem valor da proposta, o que inviabilizava o dashboard. Desde 23/09 há um
backfill que busca todos em fila lenta (ver "Backfill de detalhes"). A abertura
do card continua funcionando como antes; ela só raramente tem trabalho a fazer.

**Duas condições fazem o card buscar de novo** em vez de servir o cache:
`detalhesSincronizadosEm` nulo, **ou** card em Perdeu sem `empresaVencedora`
(ver "Detalhe buscado ≠ detalhe completo").

Endpoints da Caixa Escolar usados (descobertos via Playwright, exigem
`idSubprogram`/`idSchool`/`idBudget`/`idSupplier`, salvos no sync):
1. `GET /budget/by-subprogram/{s}/by-school/{e}/by-budget/{b}` → `initiativeDescription`
2. `GET /budget-proposal/by-subprogram/.../by-budget/{b}?sortBy=totalPropose:ASC` → concorrentes + vencedor
3. `GET /budget-proposal-item/by-subprogram/.../by-budget/{b}/by-supplier/{f}` → itens + nossa proposta

**Encoding:** a API devolve UTF-8 lido como Latin-1 (mojibake). `fixEncoding()` no
[caixa-escolar.adapter.ts](backend/src/integrations/caixa-escolar/caixa-escolar.adapter.ts) corrige — não remover.

**Endpoint 2 dá 404 enquanto a licitação está em disputa:** o portal só expõe a
lista de concorrentes depois que o resultado é decidido. Por isso ele é chamado
com `{ allow404: true }` e, sem ele, o valor total da proposta é calculado
somando `valorUnitario × quantidade` dos itens. Não tratar esse 404 fazia o
pop-up de "Proposta Enviada" falhar inteiro.

**Exibição condicional por status:** em `PROPOSTA_ENVIADA` o modal mostra
**apenas a Proposta de Itens** (com unidade e quantidade na própria tabela),
pois a negociação está em aberto. Nas colunas de Resultado mostra as 3 seções.

### Registros que saem do portal (`desaparecidoEm`)
O sync coleta os `externalId` vistos e marca via `marcarDesaparecidos()` os que
não vieram em nenhum status. Eles saem do board (`findAll` filtra
`desaparecidoEm: null`) mas ficam no banco para histórico; se reaparecerem, o
upsert limpa a marca. Isso corrigiu 5 licitações que estavam presas em
"Proposta Enviada" no painel mesmo após sair do portal.

### Decisões de escopo tomadas em 2026-09-17
- **Coluna "Monitorando" removida** — o painel acompanha só negociações em que a empresa já está participando; prospecção é resolvida por automação de e-mail própria, fora deste sistema.
- **PNCP desativado** — a API pública do PNCP não informa se a empresa participa, então só traria ruído de prospecção. O adaptador continua no código (`integrations/pncp/`), apenas fora da lista de `PORTAL_ADAPTERS` em [integrations.module.ts](backend/src/integrations/integrations.module.ts). Havia também um bug real: sem `ordenacao=data_publicacao_pncp` a API retorna itens de 2021 primeiro e a paginação parava antes de achar itens recentes (já corrigido no arquivo).

### 🔍 PNCP por CNPJ do fornecedor — investigado e descartado (2026-09-22)

Hipótese testada: usar o PNCP como fonte de **contratos que a empresa
ganhou**, em qualquer portal — o que cobriria inclusive BNC e BLL, que não
têm integração possível.

**A API certa existe** e é outra, não a de busca textual:
```
GET https://pncp.gov.br/api/consulta/v1/contratos/atualizacao
    ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD&pagina=N
```
Cada contrato traz **`niFornecedor`** (CNPJ de quem ganhou, 14 dígitos sem
pontuação), `nomeRazaoSocialFornecedor`, `objetoContrato`, `valorInicial`,
`orgaoEntidade.razaoSocial`, `processo` e `numeroControlePNCP`. Ou seja: o
dado que faltava — saber se fomos nós — **está lá**.

**⛔ Mas o parâmetro `niFornecedor` na URL é IGNORADO.** Passando o CNPJ, a
resposta veio com **368 fornecedores distintos** numa página só. É campo de
leitura, não filtro. O filtro tem de ser do nosso lado, depois de baixar.

**Custo de varrer** (500 contratos/página, ~6.400 contratos/dia no país):

| Janela | Contratos | Requisições |
|---|---|---|
| 30 dias | ~192 mil | 385 |
| 180 dias | ~1,1 milhão | 2.310 |
| 1 ano | ~2,3 milhões | 4.684 |

**Rate limit agressivo:** 429/503 constantes, exigindo esperas de 30–120s
entre lotes. Numa varredura real de 7 dias, o servidor devolveu HTTP 500 na
página 37 de 130 — ou seja, nem completa de forma confiável.

**Resultado do teste real (CNPJ 17.183.484/0001-54):**
`18.000 contratos varridos (15–22/09), 0 da empresa.`

Controle feito para descartar bug: filtrando por um CNPJ sabidamente presente
na mesma resposta, o filtro retorna 1 contrato. **A comparação funciona — o
zero é real.**

**Por que provavelmente dá zero:** o PNCP recebe os **contratos** assinados
pelos órgãos, e nem todo resultado de licitação vira contrato publicado lá
(muitos viram empenho ou ata sem registro individual do fornecedor), além do
atraso entre a homologação e a publicação. A Caixa Escolar, principal fonte
da empresa, é programa estadual de MG e não alimenta o PNCP como contrato
federal.

**Decisão: descartado.** Custo alto (centenas de requisições instáveis),
retorno nulo no teste. A varredura fica em
[scripts/pncp_busca_cnpj.sh](scripts/pncp_busca_cnpj.sh) caso se queira
repetir o teste numa janela maior — mas não vira adaptador sem antes existir
evidência de que a empresa aparece lá.

**Se for retomado algum dia:** primeiro confirmar **manualmente** em
`pncp.gov.br` se existe **qualquer** contrato da Lucri publicado. Se não
existir nenhum, não há o que integrar — e isso se descobre em minutos, sem
varrer milhões de registros.

**⏳ Pendente (2026-09-22):** a verificação manual no PNCP depende do
**certificado digital**, que estava em uso pelo setor de contabilidade. A
previsão é liberar em 23/09, quando a responsável pelo setor de licitações
poderá entrar no portal e trazer o que foi pedido. Só então se decide se o
PNCP fica descartado de vez.

### Tarefa 7 — Deploy: Docker Compose + Docker Swarm (não iniciada)
- `docker-compose.yml` para desenvolvimento (Postgres + backend + frontend).
- `docker-stack.yml` para produção no VPS via Docker Swarm, com Traefik/Nginx como reverse proxy e Docker Secrets para credenciais.
- Trocar o `provider` do Prisma de `sqlite` para `postgresql` antes do deploy.

---

## Notas técnicas importantes para continuar

- **Prisma v8 não funcionou** (CLI totalmente reestruturado, "platform-first"). O projeto está fixado em **Prisma v6** (`prisma@6`, `@prisma/client@6`) — não atualizar sem motivo.
- **ESM obrigatório**: todo import relativo em `backend/src` precisa da extensão `.js` (ex: `from './foo.js'`), mesmo em arquivos `.ts`, por causa do `"type": "module"` no `package.json` do NestJS 12 scaffoldado.
- **Sem Docker Desktop** nesta máquina de desenvolvimento — por isso o banco local é SQLite. Isso é só para dev; produção deve usar Postgres (Docker Swarm).
- Comando para rodar o backend localmente:
  ```bash
  cd backend
  npm run start:dev
  ```
- Comando para popular o usuário admin (se o banco for recriado):
  ```bash
  cd backend
  npx prisma migrate dev
  npx prisma db seed
  ```
- Login de teste: `admin@exemplo.com` / `admin123` (**trocar antes de produção**).
- Sincronizar manualmente um portal via API (autenticado como admin):
  ```
  POST /api/integrations/:id/sync   (id = "pncp" ou "caixa-escolar")
  POST /api/integrations/sync-all
  ```
