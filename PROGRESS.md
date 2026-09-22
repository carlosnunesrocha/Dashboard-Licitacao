# Progresso — Dashboard Kanban de Monitoramento de Licitações

> Atualizado em: 2026-09-22

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

### ✅ Tarefa 6 — Frontend: Kanban e autenticação (CONCLUÍDA)
- Login + rota protegida, sessão via JWT em `localStorage` com refresh automático em 401 ([api/client.ts](frontend/src/api/client.ts)).
- Board em React + `@dnd-kit` com **5 fases**: Em Análise → Documentação → Proposta Enviada → Em Disputa → **Resultado**.
- A coluna **Resultado** tem título mesclado sobre duas sub-colunas (**Ganhou | Perdeu**), cada uma um droppable próprio — soltar o card já define o `resultado`, sem diálogo extra ([KanbanResultadoColumn.tsx](frontend/src/components/KanbanResultadoColumn.tsx)).
- Card enxuto: apenas badge do portal, instituição e objeto (demais dados no modal).
- Modal do card com os detalhes reais do portal: **1)** detalhamento da solicitação, **2)** itens solicitados (un./qtd./valor de referência), **3)** nossa proposta por item (valor unitário, total, observações, garantia ofertada) + valor total do orçamento. Quando `resultado = PERDEU`, mostra bloco comparativo: nossa proposta vs. nome e valor da empresa vencedora.
- Filtros por portal, responsável e busca (debounce).

### Detalhes sob demanda (híbrido) — como funciona
`GET /api/integrations/detalhes/:licitacaoId` — na primeira abertura do card busca no
portal, persiste no banco (`LicitacaoItem` + campos de detalhe em `Licitacao`) e
retorna; nas próximas vem direto do banco. Evita um sync de ~2.700 requisições.

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
