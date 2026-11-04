# Contrato de API — Sistema de Gestão de Eventos Acadêmicos

Referência de rotas, formatos e regras de autorização entre frontend e
backend (Node.js + TypeScript + Express, implementado em `backend/` — ver
[`../backend/README.md`](../backend/README.md) pra como rodar). Os dados
ficam num cluster **TiDB Cloud** (compatível com MySQL), acessado via
Prisma (`backend/prisma/schema.prisma`), isolado atrás de
`backend/src/db/prisma.ts`. O frontend não guarda dado de negócio nenhum
localmente — toda tela fala direto com essa API.

Prefixo `/api` em tudo. JSON, `camelCase` igual aos tipos do frontend.

**Como ler este documento**: a maior parte dos recursos (eventos, salas,
palestrantes, participantes, inscrições, feedbacks) é CRUD REST
simples — `GET /api/{recurso}`, `GET /api/{recurso}/{id}`, `POST`,
`PUT /api/{recurso}/{id}`, `DELETE /api/{recurso}/{id}`. O frontend usa
literalmente essas mesmas rotas tanto pras telas de gestão (admin/secretaria)
quanto pras telas do aluno (evento, agenda, certificados) — não existem
rotas separadas "versão aluno" desses recursos. A diferença por perfil entra
como filtro/validação dentro do MESMO endpoint (esconder campo, restringir
quais linhas voltam, ignorar valor enviado pelo cliente), nunca como rota
duplicada. Só uns poucos fluxos (login/cadastro, autoinscrição e cancelamento
pelo aluno, e-mail de confirmação, emissão e validação de certificado) têm
rota dedicada de verdade — esses estão marcados como "endpoint dedicado"
abaixo.

## Perfis e permissões

Três perfis: `ADMINISTRADOR`, `SECRETARIA` e `ALUNO`. Os dois primeiros têm
acesso igual e total a tudo. Aluno é o perfil novo, com acesso restrito e
auto-cadastro.

| Recurso                                | ADMINISTRADOR | SECRETARIA | ALUNO |
|-----------------------------------------|:---:|:---:|:---:|
| Eventos — listar / detalhe               | ✅ | ✅ | ✅ |
| Eventos — criar / editar / excluir       | ✅ | ✅ | ❌ |
| Palestrantes — listar / detalhe          | ✅ | ✅ | ✅ (resposta igual pra todo mundo) |
| Palestrantes — criar / editar / excluir  | ✅ | ✅ | ❌ |
| Salas — listar / detalhe                 | ✅ | ✅ | ✅ (só nome/capacidade, pra Agenda e listagem de eventos) |
| Salas — criar / editar / excluir         | ✅ | ✅ | ❌ |
| Participantes — listar / detalhe         | ✅ | ✅ | ❌ |
| Participantes — editar / inativar / reativar / excluir | ✅ | ✅ | ❌ (participante só nasce pelo cadastro público) |
| Inscrições — listar                      | ✅ (todas) | ✅ (todas) | ✅ (só as próprias) |
| Inscrições — criar manualmente / cancelar a de um aluno | ✅ | ✅ | ❌ |
| Autoinscrição no evento / cancelar a própria inscrição | — | — | ✅ (só a própria) |
| Check-in (confirmar presença/ausência)   | ✅ | ✅ | ❌ |
| Certificados — emitir / listar           | ✅ (de qualquer participante que cumpra os requisitos) | ✅ | ✅ (só os próprios) |
| Certificados — validar pelo código       | público, sem login | público | público |
| Feedback                                 | ✅ (listar tudo, excluir com motivo; não edita) | ✅ | ✅ (enviar e excluir os próprios, só de palestra com certificado; não edita) |
| Dashboard / estatísticas (`GET /api/dashboard`) | ✅ | ✅ | ❌ |
| Participantes — ver situação do 2FA e do bloqueio | ✅ | ✅ | ❌ |
| Participantes — resetar 2FA / desbloquear a conta do aluno | ✅ | ❌ | ❌ |
| Auditoria (trilha de operações e acessos) | ✅ | ✅ | ❌ |
| Meus dados — ver e exportar os próprios dados (`/api/meus-dados`, RF026) | ❌ | ❌ | ✅ (só os próprios) |
| Trabalhos                                | removido do projeto | removido | removido |

Feedback: as regras por perfil (ninguém edita; o aluno só vê e exclui o
próprio e só avalia palestra em que recebeu o certificado; a equipe só
exclui, com motivo) estão na seção **Feedback** e são aplicadas no backend;
a tela já reflete isso.

Trabalhos saiu do escopo do projeto. Não implementar
`TrabalhoController`/`TrabalhoService`/tabela `trabalhos` — se algo já foi
gerado a partir do diagrama antigo, pode jogar fora.

## Autenticação

Toda rota exceto login, registro, recuperação de senha e a validação
pública de certificado (`GET /api/certificados/validar/{codigo}`) exige
`Authorization: Bearer <token>`.

O token é opaco pro frontend — o React não decodifica o JWT em nenhum
momento. Nome, perfil, rgm etc. vêm no corpo da resposta de login/registro,
não do token. O JWT existe só pro backend validar cada requisição.

E isso é importante: a autorização por perfil tem que ser validada no
servidor, endpoint por endpoint, nunca só escondendo botão/rota na UI. O
frontend já esconde as telas certas por perfil, mas isso é cosmético — um
aluno batendo direto em `/api/participantes` via curl precisa tomar 403
mesmo que aquela tela nunca apareça pra ele.

### `POST /api/auth/registro` — auto-cadastro de aluno (endpoint dedicado)

É o único perfil com cadastro público. Administrador e secretaria são
provisionados de outro jeito (o frontend hoje nem tem tela pra isso, fica
fora do escopo).

No registro o backend precisa criar dois registros vinculados: um `Usuario`
(login) e um `Participante` (o que já existia antes de aluno ter login, e é
usado por inscrição/check-in/agenda). É assim que o modelo de
Inscrição/Check-in continua igual — sempre referenciando `participanteId`.

Request:
```json
{
  "nomeCompleto": "João Pedro Lima",
  "rgm": "20240100110",
  "emailInstitucional": "joao.lima@alunos.umc.br",
  "senha": "SenhaForte123",
  "aceiteLgpd": true
}
```
`aceiteLgpd` precisa ser `true` — é o aceite dos Termos de Uso/Política de
Privacidade (LGPD). Validado com `z.literal(true)`, então "esconder o
checkbox no frontend" nunca é suficiente pra pular essa exigência.

Response `201`:
```json
{
  "id": "5f2b6e6a-usuario-uuid",
  "nome": "João Pedro Lima",
  "emailLogin": "joao.lima@alunos.umc.br",
  "perfil": "ALUNO",
  "rgm": "20240100110",
  "participanteId": "9c1a4d2e-participante-uuid",
  "consentimentoLgpdEm": "2026-09-25T17:52:31.626Z"
}
```
Senha não volta no corpo em nenhum endpoint, nunca. No banco ela fica só
como hash bcrypt (custo 12, salt aleatório por senha, embutido no próprio
hash); nome, e-mail e RGM ficam em texto (ver
`docs/lgpd/07-medidas-tecnicas-de-seguranca.md`).
`consentimentoLgpdEm` é a data/hora exata do aceite, gravada no servidor no
momento do registro (nunca confia em timestamp vindo do cliente) — `null`
pras contas provisionadas antes desse controle existir (admin/secretaria).

Erros:
| Status | code | Quando |
|---|---|---|
| 409 | `RGM_DUPLICADO` | já existe usuário/participante com esse RGM |
| 409 | `EMAIL_DUPLICADO` | já existe usuário com esse e-mail |
| 422 | `VALIDACAO` | campo obrigatório faltando, e-mail fora do padrão institucional, senha fraca (pelo menos 8 caracteres como piso), `aceiteLgpd` ausente ou `false` |

### `POST /api/auth/login` (endpoint dedicado)

Request:
```json
{ "emailLogin": "joao.lima@alunos.umc.br", "senha": "SenhaForte123" }
```

Response `200`:
```json
{
  "token": "<jwt assinado pelo backend>",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "usuario": {
    "id": "5f2b6e6a-usuario-uuid",
    "nome": "João Pedro Lima",
    "emailLogin": "joao.lima@alunos.umc.br",
    "perfil": "ALUNO",
    "rgm": "20240100110",
    "participanteId": "9c1a4d2e-participante-uuid"
  }
}
```
Pra administrador/secretaria, `rgm` e `participanteId` vêm `null`. O
`usuario` também traz `mfaAtivo` e a resposta traz `precisaAceitarTermos`.

Quando o login ainda não pode abrir sessão, a resposta `200` não tem
`token` — só um token temporário que serve para a etapa seguinte:
```json
{ "mfa": "PENDENTE", "tokenEtapa": "<jwt temporário>", "expiresIn": 300 }
```
Isso só acontece quando a pessoa ativou o 2FA (`mfa: "PENDENTE"`): falta o
código (`POST /api/auth/2fa/verificar`). O 2FA é opcional para todos os
perfis, então não existe etapa de configuração obrigatória.

Se o hash guardado for de custo menor que 12 (contas antigas, de custo 10),
o login refaz o hash com custo 12 depois de conferir a senha, sem mudar
nada para o usuário (`SENHA_HASH_ATUALIZADO` na auditoria).

Erros: `401 CREDENCIAIS_INVALIDAS` (e-mail ou senha errados, mesma
mensagem se a conta não existir); `403 CONTA_INATIVA` ("Sua conta está
inativa. Procure a secretaria.", sem o motivo interno) quando o aluno foi
inativado pela secretaria — só é informado depois de a senha estar certa;
`429 MUITAS_TENTATIVAS` depois de 5 tentativas erradas da mesma conta ou do
mesmo IP (15 min).

### `POST /api/auth/recuperacao-senha` e `POST /api/auth/recuperacao-senha/confirmar` (endpoints dedicados)

Fluxo de "esqueci minha senha", identificando o usuário só pelo e-mail
cadastrado (sem opção de RGM — mantém a tela simples e evita ambiguidade
com o RGM, que hoje é só numérico).

`POST /api/auth/recuperacao-senha` — Request: `{ "email": "joao.lima@alunos.umc.br" }`.
Gera um código, manda por e-mail (ou loga, se for ambiente de teste) e
responde `200` com `{}` — o código em si nunca volta no corpo em produção
(fora de produção, o backend devolve `codigoDemo` no corpo pra testar sem
e-mail configurado). `404 USUARIO_NAO_ENCONTRADO` se não achar ninguém com
esse e-mail.

`POST /api/auth/recuperacao-senha/confirmar` — Request:
`{ "email": "...", "codigo": "123456", "novaSenha": "..." }`.
`200` se der certo (as sessões abertas da conta são encerradas). `422
CODIGO_INVALIDO` se o código estiver errado, expirado, ou não existir
nenhum pendente pra esse usuário.

O pedido de código também tem limite de 5 por conta e por IP (`429`).

### Autenticação em dois fatores (TOTP)

Opcional para todos os perfis (administrador, secretaria e aluno). Código de
6 dígitos de aplicativo autenticador, passo de 30 s, tolerância de ±1
passo. Erro de código: `422 CODIGO_MFA_INVALIDO`; 5 erros seguidos na
mesma conta: `429 MUITAS_TENTATIVAS` por 15 min.

- `POST /api/auth/2fa/verificar` — só com o token `PENDENTE`. Request
  `{ "codigo": "123456" }` ou `{ "codigoRecuperacao": "ABCDE-FGH23" }`.
  Responde como o login com sessão; com código de recuperação, vem também
  `codigosRecuperacaoRestantes`.
- `POST /api/auth/2fa/configuracao` — sessão de qualquer perfil. Responde `{ "qrCode": "data:image/png;base64,...",
  "segredo": "BASE32..." }`. Enquanto não confirmar, chamar de novo devolve
  o mesmo segredo. `409 MFA_JA_ATIVO` se já estiver ativo.
- `POST /api/auth/2fa/configuracao/confirmar` — sessão. Request
  `{ "codigo": "123456" }`. Responde `{ "codigosRecuperacao": [8 códigos] }`
  (mostrados uma única vez).
- `POST /api/auth/2fa/desativar` — sessão, qualquer perfil.
  Request `{ "senha": "...", "codigo": "123456" }`. Encerra as outras
  sessões e responde com uma sessão nova para quem desativou.

O middleware `autenticar` recusa com `401` o token temporário em qualquer
outra rota.

### `GET /api/usuarios/me`

Qualquer perfil autenticado. Mesmo formato do campo `usuario` do login.
`401` se o token não for mais válido. Chamado pela página "Minha conta"
pra mostrar a situação do 2FA.

### Ações sobre a conta (só administrador)

A tela Usuários saiu do sistema e, com ela, a listagem `GET /api/usuarios`
(hoje responde `404`). A situação do 2FA e do bloqueio de cada aluno aparece
na listagem de participantes (`GET /api/participantes`, campos `usuarioId`,
`mfaAtivo` e `bloqueado`). As duas ações continuam aqui porque agem sobre a
conta de acesso, de qualquer perfil:

- `DELETE /api/usuarios/{id}/bloqueio` — `204`; remove o bloqueio por
  tentativas da conta (login, recuperação e 2FA). O bloqueio por IP não é
  removido: ele só expira sozinho (15 min).
- `DELETE /api/usuarios/{id}/2fa` — `204`; reseta o 2FA (apaga segredo e
  códigos, encerra as sessões da pessoa).

Secretaria e aluno recebem `403` nas duas. A tela Participantes chama as duas
com o `usuarioId` do aluno. Conta de administrador/secretaria não aparece em
nenhuma tela: o reset do 2FA dela é pelo script
`backend/scripts/resetar-2fa.ts` (ou por esta API, com o id da conta), e o
bloqueio por tentativas expira sozinho em 15 minutos.

## Auditoria

Toda operação que grava, altera ou apaga dados gera uma linha em
`LogAuditoria`, além de logins e acessos negados. O log só é gravado
**depois** da operação dar certo (exceto as ações de falha, que são o
próprio registro da falha). O campo `detalhe` nunca guarda dado pessoal ou
sensível (nome, e-mail, RGM, senha, código de recuperação, token,
comentário de feedback, motivo de inativação) — só o tipo da entidade + id
e um motivo curto; em edições, só os *nomes* dos campos alterados. Uma
falha ao gravar o log nunca derruba a operação de verdade (só loga o erro
no console do servidor). Os logs são imutáveis: não existe rota pra editar
ou apagar.

| Ação (`acao`) | Quando |
|---|---|
| `LOGIN_SUCESSO`, `LOGIN_FALHA` | login (a falha nunca grava o e-mail digitado; conta inativa também gera `LOGIN_FALHA`) |
| `SENHA_HASH_ATUALIZADO` | hash da senha refeito com custo 12 no login (detalhe: custo antigo → novo) |
| `ACESSO_NEGADO` | usuário autenticado barrado por perfil/posse/check-in (detalhe: método + rota, sem query string) |
| `USUARIO_REGISTRADO` | cadastro público de aluno |
| `CONSENTIMENTO_LGPD_ACEITO` | aceite dos termos; `criadoEm` é idêntico a `usuarios.consentimentoLgpdEm` |
| `RECUPERACAO_SENHA_SOLICITADA`, `RECUPERACAO_SENHA_FALHA`, `SENHA_REDEFINIDA` | fluxo "esqueci a senha" (falha: e-mail não cadastrado, código incorreto/expirado, excesso de tentativas) |
| `EMAIL_ENVIADO`, `EMAIL_FALHA` | envio de e-mail (recuperação de senha, confirmação de inscrição, aviso de cancelamento de inscrição pela equipe); nunca grava o endereço; marca "(simulado)" quando o SendGrid não está configurado |
| `SALA_CRIADA` / `_ATUALIZADA` / `_REMOVIDA` | salas |
| `PALESTRANTE_CRIADO` / `_ATUALIZADO` / `_REMOVIDO` | palestrantes |
| `EVENTO_CRIADO` / `_ATUALIZADO` / `_REMOVIDO` | eventos (só evento sem inscrição é removido; registros antigos de remoção informam quantas inscrições/feedbacks/tentativas foram junto, da época da exclusão em cascata) |
| `PARTICIPANTE_ATUALIZADO`, `_INATIVADO`, `_REATIVADO`, `_REMOVIDO` | participantes (a inativação informa quantas inscrições foram canceladas; a remoção informa o que foi junto) |
| `INSCRICAO_CRIADA` | inscrição manual (secretaria/admin) ou autoinscrição do aluno — o detalhe diz qual |
| `INSCRICAO_ATUALIZADA` | reversão de presença pra pendente |
| `INSCRICAO_CANCELADA` | cancelamento de inscrição — o detalhe diz se foi o próprio aluno, a secretaria/o administrador ou a inativação do aluno (nesse caso, uma linha por inscrição pendente em evento futuro) |
| `INSCRICAO_REMOVIDA` | só em registros antigos (o `DELETE /api/inscricoes/{id}` agora é um cancelamento e grava `INSCRICAO_CANCELADA`) |
| `PRESENCA_CONFIRMADA`, `PRESENCA_MARCADA_AUSENTE` | check-in |
| `QUESTIONARIO_RESPONDIDO` | percentual de acertos e se atingiu os 60% que liberam o certificado |
| `CERTIFICADO_EMITIDO` | emissão de certificado — o detalhe diz se foi a primeira emissão (registro gravado) ou uma nova via do mesmo certificado, e quem pediu (aluno, secretaria, administrador). Nunca grava nome, RGM nem o código de validação |
| `FEEDBACK_CRIADO`, `FEEDBACK_EXCLUIDO` | feedbacks; a exclusão diz se foi o próprio aluno ou a equipe (e, nesse caso, o motivo). `FEEDBACK_ATUALIZADO`/`_REMOVIDO` só aparecem em registros antigos |
| `MFA_ATIVADO`, `MFA_DESATIVADO`, `MFA_VERIFICADO`, `MFA_FALHA`, `MFA_BLOQUEADO`, `MFA_RESETADO`, `CODIGO_RECUPERACAO_USADO`, `BLOQUEIO_LOGIN_REMOVIDO` | 2FA e bloqueio por tentativas |
| `TERMOS_REACEITOS` | aceite de uma versão nova dos termos |
| `DADOS_EXPORTADOS` | o aluno baixou os próprios dados em JSON pela página Meus dados (RF026) — o detalhe traz só o id da `SolicitacaoTitular` registrada |
| `CONVERSAO_DADOS_PESSOAIS` | execução do script que passou nome/e-mail/RGM do formato cifrado para texto (só contagens) |

Todas as rotas abaixo são admin/secretaria only (`403` pra aluno).

`GET /api/logs-auditoria` — lista paginada, mais novo primeiro. Query
params (todos opcionais):

| Param | Padrão | Descrição |
|---|---|---|
| `page` | `1` | página (≥ 1) |
| `pageSize` | `50` | itens por página (1–200) |
| `acao` | — | código exato da ação (ex.: `SALA_CRIADA`) |
| `usuarioId` | — | id do responsável, ou `sem-responsavel` pra ações sem usuário (login falho, recuperação com e-mail inexistente) |
| `de`, `ate` | — | período, instantes ISO 8601 com fuso (limites inclusivos); `de` não pode ser posterior a `ate` |

Parâmetro inválido → `422` no formato padrão. Response `200`:

```json
{
  "itens": [
    {
      "id": "…",
      "acao": "SALA_CRIADA",
      "detalhe": "sala 17bc33b0-…",
      "criadoEm": "2026-09-26T02:25:48.684Z",
      "usuarioId": "…",
      "atorNome": "Ana Ribeiro",
      "atorRemovido": false
    }
  ],
  "total": 132,
  "page": 1,
  "pageSize": 50,
  "totalPages": 3
}
```

Cada log guarda uma cópia do nome de quem agiu (coluna `atorNome`, em texto,
tirada na hora do log): se a conta for excluída depois, o log continua
existindo com `usuarioId: null` (a FK é `ON DELETE SET NULL`; nada apaga log
em cascata), `atorNome` vem dessa cópia e
`atorRemovido` fica `true` (a tela mostra "(conta removida)"). `atorNome` só é
`null` em ação pública sem responsável (login falho, recuperação de senha com
e-mail inexistente) e nos logs criados antes da cópia existir cujo usuário foi
excluído. A trilha é só leitura: nenhuma rota, service ou script apaga ou edita
log (o TiDB não tem trigger, então essa proteção é da aplicação).

`GET /api/logs-auditoria/responsaveis` — quem já aparece na trilha, pra
montar o filtro: `[{ "id": "…", "nome": "Ana Ribeiro" }]`, ordenado por nome.

## Eventos

`Evento` e `Sessão` eram duas entidades separadas (um "Evento" guarda-chuva
com várias "Sessões" dentro) numa versão anterior deste documento. Isso foi
fundido numa entidade só: cada palestra/minicurso/workshop **é** um Evento,
sem contêiner pai. Motivo: as duas telas de gestão eram praticamente
idênticas (mesmas ações de CRUD) e o aluno tinha que navegar por dois
níveis (lista de eventos → detalhe → lista de sessões) pra chegar em algo
que, na prática, é um item só. Se o projeto precisar agrupar vários eventos
sob um "evento guarda-chuva" no futuro (ex: uma semana acadêmica com várias
palestras), isso volta como um campo opcional de agrupamento, não como a
estrutura obrigatória de antes.

```ts
interface Evento {
  id: string;
  titulo: string;           // "Minicurso: Arquitetura de Microsserviços"
  tema: string;              // "Arquitetura de Software" — assunto do evento
  horario: string;           // ISO-8601 com offset: "2026-09-14T14:00:00-03:00"
  salaId: string;
  palestranteId: string;     // obrigatório
  cargaHoraria: number;      // horas, aceita decimal — usado no certificado
  questionario: PerguntaQuestionario[]; // sempre 10 perguntas
  inscritos?: number;        // quantidade de inscrições, calculada pelo backend nas leituras
  criadoEm: string;
}

interface PerguntaQuestionario {
  id: string;
  enunciado: string;
  alternativas: { texto: string; correta: boolean }[]; // sempre 4, só 1 correta
}
```

Detalhe pro frontend lembrar quando integrar de verdade: hoje o form de
evento usa `<input type="datetime-local">`, que gera string sem timezone
("2026-09-14T14:00"). Isso precisa ser serializado com offset antes de
mandar pra API — não é conta do backend normalizar isso.

`questionario` é cadastrado pelo admin/secretaria ao criar ou editar o
evento. Para o aluno, as perguntas saem sem o campo `correta` (ver seção
**Questionário**). `inscritos` é usado pela Agenda e pelo relatório de
ocupação, sem precisar baixar todas as inscrições.

- `GET /api/eventos` e `GET /api/eventos/{id}` — qualquer perfil
  autenticado (404 se não existir). É a mesma rota usada pela tela de
  gestão (admin/secretaria) e pela Agenda/listagem de eventos (aluno) — não
  tem uma rota "enxuta" separada pro aluno, ele recebe o objeto `Evento`
  completo (menos o que já é escondido em `Palestrante`, se o frontend um
  dia parar de expandir isso client-side).
- `POST /api/eventos` — admin/secretaria, `201`, `422` se
  `palestranteId`/`salaId` não existirem.
- `PUT /api/eventos/{id}` — admin/secretaria, `200`.
- `DELETE /api/eventos/{id}` — admin/secretaria, `204`. **Só evento sem
  nenhuma inscrição** é excluído: com qualquer inscrição responde `409
  EVENTO_COM_INSCRICOES` ("Cancele as inscrições antes de excluir o
  evento.") e nada é apagado. A API não apaga mais inscrições, feedbacks nem
  tentativas em cascata (RF009/RNF010). Como só inscrição pendente de evento
  futuro pode ser cancelada, evento que já teve presença ou certificado fica
  preservado.

**Conflito de sala (RF024)** — no `POST` e no `PUT` (quando `salaId`,
`horario` ou `cargaHoraria` vêm no corpo), o evento ocupa a sala no
intervalo `[horario, horario + cargaHoraria horas)`. Se esse intervalo
cruzar o de outro evento da mesma sala, a resposta é `409
CONFLITO_DE_SALA` ("A sala já está ocupada pelo evento "<título>" nesse
horário."). O intervalo é semiaberto: evento que termina exatamente quando
o outro começa não é conflito. Na edição, o próprio evento é ignorado (os
valores que não vieram no corpo são os já gravados).

Aluno chamando POST/PUT/DELETE cai em `403 ACESSO_NEGADO`.

## Palestrantes

`nome`/`email` em texto puro no banco — não é dado sensível, a edição é
restrita à equipe e o nome já é público na agenda do evento (decisão LGPD,
ver `docs/lgpd/07-medidas-tecnicas-de-seguranca.md`). O campo `telefone`
existiu numa versão anterior e foi removido (minimização — não era usado
em nenhum fluxo automatizado).

```ts
interface Palestrante {
  id: string;
  nome: string;
  email: string;
}
```

`GET /api/palestrantes` e `GET /api/palestrantes/{id}` — qualquer perfil
autenticado, resposta igual pra todo mundo (não há mais campo restrito por
perfil). `POST /api/palestrantes`, `PUT /api/palestrantes/{id}` e
`DELETE /api/palestrantes/{id}` — administrador/secretaria. A exclusão é
bloqueada quando há eventos vinculados ao palestrante.

## Salas

```ts
interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}
```

- `GET /api/salas` e `GET /api/salas/{id}` — qualquer perfil autenticado.
  O aluno não gerencia sala nenhuma, mas a Agenda e o detalhe do evento
  mostram o nome da sala de cada sessão, então precisam poder ler a lista.
- `POST` / `PUT /api/salas/{id}` / `DELETE /api/salas/{id}` — admin/secretaria only, `403` pra aluno.

## Participantes

Representa qualquer pessoa que pode se inscrever em evento (todo aluno já
ganha um Participante automaticamente no registro, então ele nunca chama
esses endpoints diretamente). Não existe cadastro manual — a tela
`/participantes`, exclusiva de admin/secretaria, lista com busca por
nome/e-mail/RGM (a mesma lista é usada pela tela de Check-in), pode
corrigir nome/e-mail/RGM, inativar/reativar um aluno e, só quando ele já
está inativo, removê-lo de vez.

```ts
interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
  ativo: boolean;
  motivoInativacao: string | null;
}
```

`GET /api/participantes` e `GET /api/participantes/{id}` — admin/secretaria
only, `403` pra aluno. Não existe `POST` (participante só nasce via
`POST /api/auth/registro`).

A listagem (`GET /api/participantes`) traz também a situação da conta de
acesso do aluno, que a tela mostra nas colunas **2FA** e **Acesso**:

```ts
interface ParticipanteNaListagem extends Participante {
  usuarioId: string | null; // conta ALUNO vinculada (null se não houver)
  mfaAtivo: boolean;        // 2FA ativado
  bloqueado: boolean;       // bloqueado agora por excesso de tentativas (login, recuperação ou código do 2FA)
}
```

Nunca vêm segredo do 2FA, códigos de recuperação nem hash de senha. Resetar
o 2FA e desbloquear são só do administrador (ver "Ações sobre a conta").

`GET /api/participantes/alunos` — admin/secretaria only. Só os participantes
com conta de perfil `ALUNO`, em ordem alfabética (pt-BR), no mesmo formato
de `Participante` (com `ativo`). É o que a tela de Check-in carrega ao
abrir; o filtro por nome/e-mail/RGM roda no cliente em cima dessa lista.

`PUT /api/participantes/{id}` — admin/secretaria, patch parcial. Usado pra:

- **Corrigir dados** (`nome`, `email`, `rgm`), com as mesmas regras do
  cadastro. A mudança vai também para a conta de login do aluno (o e-mail
  novo passa a ser o login). `409 DUPLICIDADE_PARTICIPANTE` se o e-mail ou
  o RGM já estiver em uso.
- **Inativar** (`{ "ativo": false, "motivoInativacao": "..." }`, motivo
  obrigatório, até 500 caracteres, visível só para a equipe). Efeitos: as
  sessões abertas do aluno caem na hora; o login passa a responder `403
  CONTA_INATIVA`; autoinscrição, inscrição manual, check-in e questionário
  ficam bloqueados; as inscrições **pendentes em eventos futuros** são
  canceladas (uma `INSCRICAO_CANCELADA` por inscrição); presenças,
  tentativas e certificados já conquistados continuam valendo.
- **Reativar** (`{ "ativo": true }`, zera `motivoInativacao`): o login volta
  a funcionar. As inscrições canceladas não voltam sozinhas.

"Inativo" é só essa ação da equipe. Conta sem login há 24 meses é outro
conceito ("conta sem uso", critério de retenção — ver
`docs/lgpd/04-plano-de-retencao-e-descarte.md`).

`DELETE /api/participantes/{id}` — admin/secretaria. Só funciona se o
participante já estiver inativo (`409 PARTICIPANTE_ATIVO` caso contrário)
e não tiver certificado emitido (`409 PARTICIPANTE_COM_CERTIFICADO`: o
código impresso precisa continuar validando — a tabela `certificados` usa
`onDelete: Restrict` na inscrição); remove em cascata o `Usuario`
vinculado, inscrições, feedbacks e tentativas de questionário. Administrador e secretaria nunca têm `Participante`
associado, então nunca são alcançados por essa rota — e o serviço ainda
confere isso explicitamente (`409 USUARIO_PROTEGIDO`) como garantia extra.

## Inscrições

```ts
type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;   // setado só no check-in
  usuarioId: string | null;     // quem fez o check-in, não quem se inscreveu
  dataInscricao: string;        // data da autoinscrição
}
```

### `GET /api/inscricoes?eventoId=&participanteId=&status=`

Todos os filtros são opcionais, sem paginação (carrega tudo de uma vez,
igual o frontend faz hoje). Usado em vários lugares: tela de gestão de
Inscrições, contagem de inscritos na Agenda, checar "já estou inscrito
nesse evento?" na listagem de eventos, e listar certificados disponíveis
(`status=PRESENTE`).

- **Admin/secretaria**: veem qualquer combinação de filtros, qualquer participante.
- **Aluno**: pode chamar essa mesma rota, mas o backend **ignora/sobrescreve
  o `participanteId` enviado e sempre usa o do token** — mesmo princípio da
  autoinscrição, existe pra impedir um aluno de consultar inscrição de
  outra pessoa forjando o query param. Ele nunca recebe inscrição de
  ninguém além dele mesmo por essa rota, não importa o que passar na URL.

### `POST /api/inscricoes` — inscrição manual (admin/secretaria)

`{ "participanteId": "pa3", "eventoId": "se2" }`, mesmas regras de conflito
da autoinscrição (`409 JA_INSCRITO` / `409 EVENTO_LOTADO`). Aluno toma
`403` — ele usa o endpoint de autoinscrição abaixo, não esse. Aluno inativo:
`409 PARTICIPANTE_INATIVO` ("Aluno inativo: não é possível inscrevê-lo em
eventos.").

### `PUT /api/inscricoes/{id}` — atualização parcial (admin/secretaria)

É essa mesma rota genérica que o Check-in usa pra confirmar presença ou
marcar ausência — não existe uma rota `/checkin/...` separada. O corpo é
um patch parcial:

- Confirmar presença: `{ "statusPresenca": "PRESENTE", "dataCheckin": "<agora>" }` —
  o backend ignora qualquer `usuarioId` que vier no corpo e seta o do
  token (de quem está fazendo o check-in). É esse evento que libera o
  certificado.
- Marcar ausente: `{ "statusPresenca": "AUSENTE", "dataCheckin": null }`.

Confirmar presença de um aluno **inativo** retorna `409 PARTICIPANTE_INATIVO`
("Aluno inativo: não é possível confirmar presença.") — a tela de Check-in
também desabilita o botão, mas a regra vale na API.

**Presença travada depois do questionário (RF015)**: se o aluno já tem
alguma tentativa do questionário daquele evento, qualquer mudança de
presença responde `409 PRESENCA_TRAVADA` ("A presença não pode mais ser
alterada: o aluno já respondeu o questionário."). A mesma trava vale para
excluir/cancelar a inscrição. A tela de Check-in desabilita "Confirmar
presença" e "Ausente" nesses casos (ela consulta
`GET /api/questionario-tentativas?participanteId=`).

Aluno toma `403` em qualquer `PUT`/`DELETE` de inscrição — ele não confirma
a própria presença, isso é sempre feito por quem está na recepção do
evento. A tela de Check-in carrega todos os alunos de uma vez em
`GET /api/participantes/alunos` e filtra por nome/e-mail/RGM no cliente.
Funciona para o volume de dados de uma feira acadêmica; se crescer, um
`?busca=` nessa rota resolveria sem mudar o frontend.

### Cancelamento de inscrição (RF025)

Regra única, a mesma para o aluno e para a equipe, aplicada no service
(`inscricoes.service.ts`, função `cancelar`). Só cancela se:

1. o aluno **não respondeu** o questionário do evento — senão `409
   PRESENCA_TRAVADA` (ver acima);
2. a presença está **`PENDENTE`** — senão `409 PRESENCA_JA_REGISTRADA`
   ("Não é possível cancelar: a presença desta inscrição já foi registrada
   no check-in.");
3. o evento **ainda não começou** (`horario` no futuro) — senão `409
   EVENTO_JA_INICIADO` ("Não é possível cancelar: o evento já começou.").

O cancelamento apaga a inscrição e libera a vaga na hora: o aluno pode se
inscrever de novo se ainda houver vaga. Auditoria: `INSCRICAO_CANCELADA`,
dizendo quem cancelou.

#### `DELETE /api/eventos/{eventoId}/inscricoes` — cancelamento pelo aluno (endpoint dedicado)

Só `ALUNO` (`403` para a equipe). Corpo vazio; sempre cancela a inscrição
do participante do token. `204` se cancelou; `404
INSCRICAO_NAO_ENCONTRADA` ("Você não está inscrito neste evento.") se não
houver inscrição; `409` pelas regras acima. A tela Eventos mostra o botão
"Cancelar inscrição" (com confirmação) nas inscrições ainda pendentes de
eventos que não começaram.

#### `DELETE /api/inscricoes/{id}` (admin/secretaria)

`204`. A equipe cancela a inscrição de qualquer aluno, com a **mesma
regra** acima. O aluno é avisado por e-mail (SendGrid, `email.service.ts`);
se o envio falhar, o cancelamento continua valendo e a falha fica na
auditoria (`EMAIL_FALHA`). Aluno toma `403` nesta rota — ele usa a rota
dedicada acima.

### `POST /api/eventos/{eventoId}/inscricoes` — autoinscrição (endpoint dedicado, aluno)

Corpo vazio. O backend ignora qualquer `participanteId` que vier no corpo,
sempre usa o do token — não é só conveniência, é o que impede um aluno de
se inscrever em nome de outro forjando a requisição.

Response `201`:
```json
{
  "id": "i9",
  "participanteId": "9c1a4d2e-participante-uuid",
  "eventoId": "se2",
  "statusPresenca": "PENDENTE",
  "dataCheckin": null,
  "usuarioId": null,
  "dataInscricao": "2026-09-01T10:00:00-03:00"
}
```

Esse endpoint não dispara e-mail nenhum sozinho. O frontend chama, em
seguida, o endpoint de confirmação por e-mail (documentado logo abaixo)
passando o `id` que voltou aqui. Separar os dois dá pra tela mostrar
"inscrito, mas o e-mail falhou" em vez de um POST monolítico que ou faz
tudo ou nada.

Erros:
| Status | code | Quando |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | sem token / token inválido |
| 403 | `ACESSO_NEGADO` | token válido mas perfil não é aluno |
| 403 | `CONTA_INATIVA` | aluno inativado pela secretaria |
| 404 | `EVENTO_NAO_ENCONTRADO` | id inexistente |
| 409 | `EVENTO_JA_INICIADO` | o evento já começou (`horario` no passado): "Não é possível se inscrever: o evento já começou." |
| 409 | `JA_INSCRITO` | esse aluno já tá inscrito nesse evento |
| 409 | `EVENTO_LOTADO` | capacidade da sala já bateu |

A tela Eventos do aluno mostra o botão desabilitado "Encerrado" nos eventos
que já começaram. A inscrição manual da equipe (`POST /api/inscricoes`)
continua aceitando evento passado, pra registro retroativo de quem esteve
no evento.

### `POST /api/inscricoes/{id}/confirmacao-email` (endpoint dedicado)

Chamado pelo frontend logo depois que a autoinscrição acima retorna `201`.
Só o dono da inscrição pode disparar (perfil aluno, `participanteId` do
token tem que bater com o da inscrição). Corpo vazio.

Response `200`:
```json
{ "destinatario": "joao.lima@alunos.umc.br", "enviadoEm": "2026-08-27T10:00:00-03:00" }
```

Erros:
| Status | code | Quando |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | sem token / token inválido |
| 403 | `ACESSO_NEGADO` | a inscrição não pertence ao aluno do token |
| 404 | `INSCRICAO_NAO_ENCONTRADA` | id inexistente |

O corpo do e-mail junta dados de três lugares (inscrição → evento →
palestrante), então faz sentido resolver tudo isso no service antes de
montar a mensagem em vez de espalhar query em cada camada. Implementação
real em `backend/src/modules/inscricoes/inscricoes.service.ts` (função
`confirmarEmail`) usando a API do SendGrid:

```ts
async function confirmarEmail(id: string, participanteIdDoToken: string) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id },
    include: { participante: true, evento: { include: { palestrante: true } } },
  });
  if (!inscricao) throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  await emailService.enviarConfirmacaoInscricao(inscricao.participante.email, {
    participanteNome: inscricao.participante.nome,
    eventoTitulo: inscricao.evento.titulo,
    eventoTema: inscricao.evento.tema,
    palestranteNome: inscricao.evento.palestrante.nome,
    eventoHorario: inscricao.evento.horario,
  });

  return { destinatario: inscricao.participante.email, enviadoEm: new Date().toISOString() };
}
```

(`prisma` vem de `backend/src/db/prisma.ts` — instância única do Prisma
Client usada por todos os services, ver `backend/README.md`. O `include`
já traz participante/evento/palestrante numa consulta só, em vez de três
idas ao banco.)

`emailService` (`backend/src/modules/email/email.service.ts`) usa o SDK do
SendGrid, configurado por variável de ambiente (`SENDGRID_API_KEY`,
`EMAIL_FROM` — ver `backend/README.md`). `EMAIL_FROM` precisa ser
exatamente o e-mail que passou pela "Single Sender Verification" no
SendGrid, senão o envio falha. **Sem `SENDGRID_API_KEY` configurada, o
e-mail não é enviado de verdade — só impresso no console**
(`[e-mail simulado] ...`), o que é o padrão em desenvolvimento local e
evita precisar de uma conta no SendGrid só pra testar o fluxo. Se o envio
falhar (API fora do ar, chave inválida), a exceção sobe como erro 500
padrão — não derruba a inscrição, que já foi criada e
persistida antes desse endpoint ser chamado.

Já a recuperação de senha (`POST /api/auth/recuperacao-senha`) trata falha
de envio como não-fatal — ela sempre responde `200`, com ou sem e-mail de
verdade, porque a rota já tem o mecanismo de `codigoDemo` (ver seção
"Autenticação" acima) pra continuar funcionável mesmo sem envio configurado
ou se o provedor recusar o destinatário.

## Questionário

- `GET /api/eventos/{eventoId}/questionario` — qualquer perfil autenticado.
  As 10 perguntas **sem** o campo `correta`.
- `POST /api/eventos/{eventoId}/questionario/respostas` — só aluno. Request
  `{ "respostas": [0, 2, 1, ...] }` (índice da alternativa escolhida em cada
  uma das 10 perguntas). O backend corrige e grava a tentativa (`201`).
  Erros: `403 CONTA_INATIVA` (aluno inativo); `403 ACESSO_NEGADO` se a
  presença do aluno no evento não estiver confirmada (`PRESENTE`); `409
  QUESTIONARIO_JA_APROVADO` (já passou dos 60%); `409
  LIMITE_TENTATIVAS_ATINGIDO` (2 tentativas); `422` se faltar resposta.
- `GET /api/eventos/{eventoId}/questionario/tentativas` — só aluno, as
  tentativas dele nesse evento.
- `GET /api/questionario-tentativas` — admin/secretaria, todas as
  tentativas (nota na tela de Certificados da equipe). Com
  `?participanteId=`, só as daquele aluno (tela de Check-in, que trava a
  presença de quem já respondeu).

O certificado é liberado com presença confirmada e alguma tentativa com
pelo menos 60% de acertos.

## Certificados

O certificado é um registro de verdade (tabela `certificados`, model
`Certificado`), gravado **na primeira emissão** (RF018/RF019). O PDF
continua montado no navegador (`jsPDF`), mas só com o que a API devolve —
o código de validação e todos os textos impressos vêm do backend.

```ts
interface Certificado {
  id: string;
  inscricaoId: string;       // único: um certificado por inscrição
  eventoId: string;          // da inscrição
  participanteId: string;    // da inscrição
  codigoValidacao: string;   // 12 caracteres aleatórios (crypto.randomBytes), ex.: "7KQ2MX9D4RTA"
  nomeParticipante: string;  // ↓ cópia dos dados impressos, tirada na primeira emissão
  rgm: string;
  tituloEvento: string;
  temaEvento: string;
  nomePalestrante: string;
  dataEvento: string;        // ISO-8601
  cargaHoraria: number;
  emitidoEm: string;         // ISO-8601
}
```

- **Código de validação**: 12 símbolos sorteados com `crypto.randomBytes`
  do alfabeto base32 de Crockford (`0-9` e `A-Z` sem `I`, `L`, `O`, `U`) —
  60 bits, sem nenhuma relação com ids internos. O PDF imprime em grupos
  (`7KQ2-MX9D-4RTA`); a validação aceita com ou sem hífen, em minúsculas,
  e troca `O`→`0`, `I`/`L`→`1`.
- **Cópia (snapshot) dos dados impressos**: o certificado emitido não muda
  se o evento for editado ou o nome do aluno for corrigido depois, e a
  validação pública confere exatamente o que foi impresso.
- **Integridade**: `inscricaoId` é FK com `onDelete: Restrict` — a
  inscrição de um certificado emitido não pode ser apagada (ela já fica
  travada pela regra de presença, e o aluno com certificado não pode ser
  removido: `409 PARTICIPANTE_COM_CERTIFICADO`).

### `POST /api/certificados/emitir/{inscricaoId}` (endpoint dedicado)

Qualquer perfil autenticado, corpo vazio.

- **Aluno**: só a própria inscrição (`403` se for de outra pessoa).
- **Admin/secretaria**: qualquer inscrição que cumpra os requisitos.

Na primeira chamada confere os requisitos — presença `PRESENTE` **e**
alguma tentativa do questionário com pelo menos 60% (mesma regra de
`utils/certificado.ts` e `utils/questionario.ts`) — e grava o certificado:
`201`. Nas chamadas seguintes devolve o **mesmo registro** (mesmo `id`,
código e `emitidoEm`, nada é regerado): `200`. Duas emissões simultâneas da
mesma inscrição resultam num registro só (índice único em `inscricaoId`).

Erros: `404 INSCRICAO_NAO_ENCONTRADA`; `403 ACESSO_NEGADO` (aluno pedindo
inscrição de outra pessoa); `409 CERTIFICADO_NAO_LIBERADO` ("O certificado
só é liberado depois da confirmação de presença no check-in." ou "... depois
de atingir 60% de acertos no questionário do evento."). Auditoria:
`CERTIFICADO_EMITIDO` (primeira emissão ou nova via).

### `GET /api/certificados?eventoId=`

Lista os certificados já emitidos, mais recentes primeiro, no formato
`Certificado` acima. A **equipe** vê todos (filtro `eventoId` opcional); o
**aluno** só os próprios — o participante é sempre o do token.

A tela de Certificados continua listando as inscrições com presença
confirmada (`GET /api/inscricoes?status=PRESENTE`) junto com a nota do
questionário; essa rota informa quais já têm certificado e com qual código.

### `GET /api/certificados/validar/{codigo}` — validação pública (RF027)

**Sem token.** Usada pela página pública `/validar-certificado` do frontend
(link na tela de login; o PDF imprime o endereço da página junto com o
código, e o endereço é um link que já abre a consulta). Response `200`,
só com o necessário para conferir o documento — **sem RGM e sem e-mail**:

```json
{
  "nomeParticipante": "João Pedro Lima",
  "tituloEvento": "Minicurso: Arquitetura de Microsserviços",
  "dataEvento": "2026-09-14T17:00:00.000Z",
  "cargaHoraria": 2,
  "emitidoEm": "2026-09-15T12:03:44.120Z"
}
```

Erros: `404 CERTIFICADO_NAO_ENCONTRADO` ("Certificado não encontrado.") —
também para código fora do formato; `429 MUITAS_TENTATIVAS` depois de 30
consultas do mesmo IP (todas contam, não só as erradas), por 15 minutos
(`utils/limiteAcesso.ts`, chave `validacao:ip:<ip>`). A consulta pública
não grava auditoria (não tem responsável e encheria a trilha).

## Feedback

```ts
interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;        // 1 a 5
  comentario: string;
}
```

Recurso flat — `GET/POST/DELETE /api/feedbacks`. Regras (todas validadas
no backend, a tela só reflete o que a API liberou):

- **Aluno só avalia palestra em que já recebeu o certificado** — a mesma regra
  da tela de Certificados: presença confirmada (`PRESENTE`) **e** alguma
  tentativa do questionário com no mínimo 60% (`utils/certificado.ts`,
  `utils/questionario.ts`). Sem isso, `POST /api/feedbacks` responde `403`
  "Você só pode avaliar palestras em que recebeu o certificado."
- Um feedback por aluno por evento (índice único `participanteId + eventoId`):
  `409 FEEDBACK_JA_ENVIADO` se já avaliou. Se o aluno excluir o dele, pode
  enviar outro.
- Só o aluno cria, e sempre com o próprio `participanteId` (o do token; o do
  corpo é ignorado). Ele só lê o próprio, nunca a lista inteira. `422
  VALIDACAO` se a nota estiver fora de 1-5 ou o comentário vazio ou com mais
  de 1000 caracteres. Admin/secretaria tomam `403` no `POST`.
- Admin/secretaria veem tudo (`GET /api/feedbacks?eventoId=`).
- **Ninguém edita feedback.** `PUT /api/feedbacks/{id}` responde sempre `403`,
  para qualquer perfil.
- `DELETE /api/feedbacks/{id}` responde `204`:
  - **Aluno**: exclui só o próprio (`403` se for de outra pessoa), sem corpo.
  - **Admin/secretaria**: exclui qualquer um, com o motivo no corpo:
    `{ "motivo": "CONTEUDO_OFENSIVO" | "DADO_PESSOAL_EXPOSTO" | "FORA_DO_TEMA" | "PEDIDO_DO_ALUNO" }`
    (`422` sem motivo válido). A lista é fechada para não gravar texto livre
    (que poderia ter dado pessoal) na trilha de auditoria.
- Auditoria: `FEEDBACK_CRIADO` e `FEEDBACK_EXCLUIDO` (o detalhe diz se foi o
  próprio aluno ou a equipe, e o motivo).

`GET /api/feedbacks/elegiveis` — só `ALUNO` (`403` pra equipe). Eventos que o
aluno logado pode avaliar agora (recebeu o certificado e ainda não avaliou):
`[{ "id": "…", "titulo": "…", "horario": "2026-09-27T14:00:00.000Z" }]`. É o
que preenche o select do modal "Novo feedback"; lista vazia = botão
desabilitado com o motivo.

## Dashboard

`GET /api/dashboard` — só admin/secretaria (`403` pra aluno). Tudo que a
tela Dashboard mostra, agregado no servidor numa chamada só. Só números,
título do evento e nome da sala — nenhum dado pessoal (nome, e-mail, RGM,
quem se inscreveu ou quem avaliou).

```ts
interface ResumoDashboard {
  totais: {
    eventos: number;
    eventosFuturos: number;        // horário >= agora
    inscricoes: number;            // presentes + ausentes + pendentes
    presentes: number;
    ausentes: number;
    pendentes: number;
    taxaPresenca: number | null;   // presentes / (presentes + ausentes) × 100; null sem check-in
    certificadosLiberados: number; // presença confirmada + ≥ 60% no questionário do mesmo evento
    ocupacaoMediaSalas: number | null; // RF021: média, entre os eventos, de inscritos / capacidade da sala × 100; null sem evento
    mediaFeedback: number | null;  // 1 a 5; null sem feedback
    totalFeedbacks: number;
  };
  proximosEventos: { id; titulo; horario; salaNome; capacidade; inscritos }[]; // até 5, do mais próximo
  eventos: { id; titulo; horario; inscritos; presentes; ausentes; pendentes }[]; // todos, por horário
}
```

A taxa de presença considera só os check-ins já registrados (presente ou
ausente): inscrição pendente de evento futuro não puxa a taxa pra baixo.

A ocupação média das salas é a média simples dos percentuais de ocupação
de cada evento (cada evento pesa igual, independentemente do tamanho da
sala); sala com capacidade 0 fica fora da conta. A tela mostra o valor
arredondado num cartão próprio ("Ocupação média das salas").

## Meus dados — direitos do titular (RF026, LGPD art. 18)

Versão enxuta: o aluno **vê e exporta** os próprios dados pelo sistema; os
demais pedidos (correção, anonimização/exclusão, revisão humana do
resultado do questionário, oposição) são atendidos pelo e-mail
`privacidade@sgeacademicos.com.br`, em até 15 dias (procedimento em
`docs/lgpd/08-procedimento-direitos-dos-titulares.md`).

As duas rotas são **só do `ALUNO`** (`403` para a equipe, `401` sem token)
e sempre usam o participante do token — não existe parâmetro de id, então
ninguém consulta os dados de outra pessoa por aqui. As respostas vêm com
`Cache-Control: no-store`.

### `GET /api/meus-dados`

Tudo o que o sistema guarda sobre o aluno. Só leitura: não grava solicitação
nem log. Ficam de fora o que não é informação sobre a pessoa e só serve à
segurança da conta (hash da senha, segredo e códigos de recuperação do 2FA)
e, nos questionários, o gabarito e as alternativas marcadas — vai só o
resultado.

```ts
interface MeusDados {
  geradoEm: string;                     // instante em que a resposta foi montada
  dadosCadastrais: {
    nome: string;
    email: string;
    rgm: string;
    cadastradoEm: string;               // criação da conta
    termos: { aceitoEm: string | null; versao: string | null };  // aceite dos Termos/Política
    doisFatores: { ativo: boolean; ativadoEm: string | null };
  };
  inscricoes: { evento; dataEvento; inscritoEm; presenca: "PENDENTE" | "PRESENTE" | "AUSENTE"; checkinEm: string | null }[];
  questionarios: { evento; respondidoEm; acertos; totalPerguntas; percentual }[];  // uma linha por tentativa
  certificados: { evento; dataEvento; cargaHoraria; codigoValidacao; emitidoEm; nomeImpresso; rgmImpresso }[];
  avaliacoes: { evento; nota; comentario; enviadaEm }[];
}
```

`evento` é o título. As listas vêm em ordem cronológica (inscrições pela data
do evento). `nomeImpresso`/`rgmImpresso` são a cópia gravada na emissão do
certificado (ver **Certificados**).

### `GET /api/meus-dados/exportacao`

Mesmo conteúdo do `GET /api/meus-dados`, como arquivo para download:
`Content-Type: application/json` e
`Content-Disposition: attachment; filename="meus-dados-sgea.json"`
(JSON indentado). Cada exportação:

- grava uma `SolicitacaoTitular` com `tipo: "EXPORTACAO"`,
  `status: "ATENDIDA"` e `atendidoEm` = agora (`atendidoPorId` fica nulo:
  ninguém da equipe precisou agir);
- registra `DADOS_EXPORTADOS` na auditoria, com o id da solicitação e o
  aluno como responsável — nunca nome, e-mail ou RGM.

A tela **Meus dados** (`/meus-dados`, só aluno, item do menu depois de
"Minha conta") mostra essas seções em tabelas, o botão "Baixar meus dados
(JSON)" e um bloco "Outros pedidos sobre seus dados" com um botão que abre o
e-mail de privacidade (`mailto`) com o assunto "Solicitação LGPD – SGEA" e o
RGM no corpo. Na tela de **Certificados**, o evento em que o aluno ficou
abaixo de 60% nas duas tentativas mostra o link "Pedir revisão do
resultado", que abre o mesmo e-mail com o assunto "Revisão do resultado do
questionário – {título do evento}".

## Formato de erro

Todo erro segue o mesmo formato:
```json
{
  "timestamp": "2026-08-25T14:32:00-03:00",
  "status": 409,
  "code": "RGM_DUPLICADO",
  "message": "Já existe um cadastro com este RGM.",
  "path": "/api/auth/registro"
}
```

Pra 422, com detalhe por campo:
```json
{
  "timestamp": "2026-08-25T14:32:00-03:00",
  "status": 422,
  "code": "VALIDACAO",
  "message": "Dados inválidos.",
  "path": "/api/auth/registro",
  "erros": [
    { "campo": "emailInstitucional", "mensagem": "E-mail institucional inválido." },
    { "campo": "senha", "mensagem": "A senha deve ter ao menos 8 caracteres." }
  ]
}
```

Códigos usados neste documento:

| Status | code | Significado |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | token ausente, inválido ou expirado |
| 401 | `CREDENCIAIS_INVALIDAS` | login/senha incorretos |
| 403 | `ACESSO_NEGADO` | autenticado, mas sem permissão pro recurso |
| 403 | `CONTA_INATIVA` | aluno inativado pela secretaria (login, autoinscrição, questionário) |
| 404 | `*_NAO_ENCONTRADO(A)` | id não existe |
| 409 | `RGM_DUPLICADO` / `EMAIL_DUPLICADO` | conflito de unicidade no cadastro |
| 409 | `JA_INSCRITO` | inscrição duplicada no mesmo evento |
| 409 | `EVENTO_LOTADO` | capacidade da sala esgotada |
| 409 | `FEEDBACK_JA_ENVIADO` | feedback duplicado pro mesmo evento |
| 409 | `PARTICIPANTE_INATIVO` | inscrição manual ou check-in de aluno inativo |
| 409 | `CONFLITO_DE_SALA` | a sala já está ocupada por outro evento no intervalo do evento |
| 409 | `EVENTO_COM_INSCRICOES` | exclusão de evento que ainda tem inscrição |
| 409 | `PRESENCA_TRAVADA` | mudança de presença ou cancelamento depois de o aluno responder o questionário |
| 409 | `PRESENCA_JA_REGISTRADA` | cancelamento de inscrição com presença já registrada no check-in |
| 409 | `EVENTO_JA_INICIADO` | autoinscrição ou cancelamento de inscrição de evento que já começou |
| 409 | `CERTIFICADO_NAO_LIBERADO` | emissão sem presença confirmada ou sem a nota mínima |
| 409 | `PARTICIPANTE_COM_CERTIFICADO` | remoção de aluno que tem certificado emitido |
| 404 | `CERTIFICADO_NAO_ENCONTRADO` | validação pública com código inexistente |
| 429 | `MUITAS_TENTATIVAS` | limite de tentativas (login, recuperação de senha, 2FA) ou de consultas de validação de certificado por IP |
| 422 | `CODIGO_INVALIDO` | código de recuperação de senha errado/expirado |
| 422 | `VALIDACAO` | campo inválido/ausente no corpo |

401 é sempre token ausente/inválido/expirado, antes de qualquer checagem de
perfil. 403 só depois de confirmar que o token é válido mas o perfil não
tem permissão — não misturar os dois, e não usar 404 pra esconder um 403
(esse projeto não tem esse tipo de exigência de sigilo).

## O que muda no modelo atual

| Entidade | Mudança |
|---|---|
| `Usuario` | perfil novo `ALUNO`; campos novos `rgm` e `participanteId` (nullable, só ALUNO) |
| `Evento` | fundido com a antiga entidade `Sessao` — ver seção **Eventos**; campos novos: `palestranteId` (obrigatório), `tema`, `cargaHoraria`, `questionario` (10 perguntas de múltipla escolha) |
| `Inscricao` | campo `sessaoId` renomeado pra `eventoId` (reflete a fusão acima); campo novo `dataInscricao` |
| `Feedback` | continua flat (`/api/feedbacks`), sem aninhar em `/eventos/{id}/feedback` como uma versão anterior deste documento sugeria |
| `Trabalho` | removido — entidade, tabela e endpoints |
| `Certificado` | entidade e tabela `certificados` (migration `20261104120000_certificados`): gravado na primeira emissão, com código de validação aleatório e cópia dos dados impressos; PDF montado no cliente com esses dados |

## Lacunas conhecidas (frontend ainda não fez, backend não precisa esperar)

- A sessão não é revalidada no reload (o React confia no localStorage até
  a primeira chamada tomar `401`); `GET /api/usuarios/me` só é chamado pela
  página "Minha conta".
- Busca de aluno no Check-in é client-side (`GET /api/participantes/alunos`
  carrega tudo, filtra no navegador) — funciona, mas não escala pra uma base
  grande de dados.
- Certificados baixados antes da migration `20261104120000_certificados`
  traziam um código "decorativo" calculado no navegador, que não valida na
  página pública: quem precisar de comprovante validável emite de novo (a
  primeira emissão depois da migration grava o código definitivo).
- O conflito de sala é conferido na aplicação (consulta antes de gravar):
  dois cadastros exatamente simultâneos na mesma sala poderiam passar os
  dois. Para o volume de uma secretaria isso é aceitável; uma trava no
  banco resolveria se for preciso.

## Decisões tomadas na implementação do backend

Estas questões estavam em aberto neste documento e foram resolvidas ao
implementar `backend/` de verdade — registrado aqui pra não ficar só na
cabeça de quem escreveu o código:

- **Política de senha**: mínimo de 8 caracteres, sem outra exigência
  (maiúscula/número/símbolo). Validado em `auth.schemas.ts` tanto no
  registro quanto na redefinição de senha.
- **Domínio do e-mail institucional**: sim, precisa terminar com
  `@alunos.umc.br` — mesma regra que já existia no frontend
  (`CadastroPage.tsx`), agora também validada no backend.
- **Hash de senha**: bcrypt (`bcryptjs`), custo 12, salt aleatório por
  senha embutido no hash (`$2a$12$...`). Hashes antigos de custo 10 são
  refeitos no próximo login.
- **Validação nos formulários**: a tela valida os mesmos campos que o
  backend (incluindo o mínimo de 8 caracteres da senha) e mostra o erro
  embaixo do campo certo; os `erros` do `422` vindos da API também aparecem
  embaixo do campo correspondente.

## Coisa que ainda não decidimos

- Como fica o provisionamento de conta admin/secretaria (não existe tela
  nem endpoint pra isso — hoje só existem via `backend/src/db/seedData.ts`).
- Se a exportação de CSV de presença migra pro backend ou continua no cliente.
