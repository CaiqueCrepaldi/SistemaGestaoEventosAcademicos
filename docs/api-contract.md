# Contrato de API — Sistema de Gestão de Eventos Acadêmicos

Referência de rotas, formatos e regras de autorização entre frontend e
backend (Node.js + TypeScript + Express, implementado em `backend/` — ver
[`../backend/README.md`](../backend/README.md) pra como rodar). O banco de
dados (PostgreSQL) é administrado à parte, em outra ferramenta/projeto —
por enquanto o backend guarda os dados em memória, isolado em
`backend/src/db/`, sem afetar nada do que está documentado aqui (rota,
formato de request/response e regra de autorização continuam os mesmos,
não importa o que tem por trás guardando o dado). O frontend já roda hoje
contra um mock em `localStorage` que segue esse mesmo contrato, então
trocar por chamadas HTTP reais é só trocar a camada de serviço — a UI não muda.

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
duplicada. Só uns poucos fluxos (login/cadastro, autoinscrição, e-mail de
confirmação) têm rota dedicada de verdade — esses estão marcados como
"endpoint dedicado" abaixo.

## Perfis e permissões

Três perfis: `ADMINISTRADOR`, `SECRETARIA` e `ALUNO`. Os dois primeiros têm
acesso igual e total a tudo. Aluno é o perfil novo, com acesso restrito e
auto-cadastro.

| Recurso                                | ADMINISTRADOR | SECRETARIA | ALUNO |
|-----------------------------------------|:---:|:---:|:---:|
| Eventos — listar / detalhe               | ✅ | ✅ | ✅ |
| Eventos — criar / editar / excluir       | ✅ | ✅ | ❌ |
| Palestrantes — listar / detalhe          | com telefone | com telefone | sem telefone |
| Palestrantes — criar / editar / excluir  | ✅ | ✅ | ❌ |
| Salas — listar / detalhe                 | ✅ | ✅ | ✅ (só nome/capacidade, pra Agenda e listagem de eventos) |
| Salas — criar / editar / excluir         | ✅ | ✅ | ❌ |
| Participantes (cadastro avulso)          | ✅ | ✅ | ❌ |
| Inscrições — listar                      | ✅ (todas) | ✅ (todas) | ✅ (só as próprias) |
| Inscrições — criar/excluir manualmente   | ✅ | ✅ | ❌ |
| Autoinscrição no evento                  | — | — | ✅ (só a própria) |
| Check-in (confirmar presença/ausência)   | ✅ | ✅ | ❌ |
| Certificados                             | ✅ (de qualquer participante) | ✅ | ✅ (só os próprios) |
| Feedback                                 | ✅ (listar tudo) | ✅ | ✅ (ver ⚠️ abaixo) |
| Dashboard / estatísticas                 | ✅ | ✅ | ❌ |
| Trabalhos                                | removido do projeto | removido | removido |

⚠️ **Feedback ainda não tem o mesmo tratamento por perfil que o resto** — a
tela hoje é a mesma para os três perfis, sem restringir aluno a ver/editar
só o próprio feedback. Isso é uma lacuna conhecida do frontend atual (não
foi adaptada quando os outros recursos ganharam a visão por perfil), listada
em "coisas que ainda faltam" no fim deste documento. Pra manter os dois
lados honestos: implemente a autorização do jeito que está descrito na
seção **Feedback**, mesmo que o frontend ainda não a exija — é o
comportamento correto e o frontend vai alcançar depois.

Trabalhos saiu do escopo do projeto. Não implementar
`TrabalhoController`/`TrabalhoService`/tabela `trabalhos` — se algo já foi
gerado a partir do diagrama antigo, pode jogar fora.

## Autenticação

Toda rota exceto `POST /api/auth/login` e `POST /api/auth/registro` exige
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
  "rgm": "2024010011",
  "emailInstitucional": "joao.lima@aluno.ifsp.edu.br",
  "senha": "SenhaForte123"
}
```

Response `201`:
```json
{
  "id": "5f2b6e6a-usuario-uuid",
  "nome": "João Pedro Lima",
  "emailLogin": "joao.lima@aluno.ifsp.edu.br",
  "perfil": "ALUNO",
  "rgm": "2024010011",
  "participanteId": "9c1a4d2e-participante-uuid"
}
```
Senha não volta no corpo em nenhum endpoint, nunca.

Erros:
| Status | code | Quando |
|---|---|---|
| 409 | `RGM_DUPLICADO` | já existe usuário/participante com esse RGM |
| 409 | `EMAIL_DUPLICADO` | já existe usuário com esse e-mail |
| 422 | `VALIDACAO` | campo obrigatório faltando, e-mail fora do padrão institucional, senha fraca (pelo menos 8 caracteres como piso) |

### `POST /api/auth/login` (endpoint dedicado)

Request:
```json
{ "emailLogin": "joao.lima@aluno.ifsp.edu.br", "senha": "SenhaForte123" }
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
    "emailLogin": "joao.lima@aluno.ifsp.edu.br",
    "perfil": "ALUNO",
    "rgm": "2024010011",
    "participanteId": "9c1a4d2e-participante-uuid"
  }
}
```
Pra administrador/secretaria, `rgm` e `participanteId` vêm `null`.

Erro: `401 CREDENCIAIS_INVALIDAS` se e-mail ou senha estiverem errados.

### `POST /api/auth/recuperacao-senha` e `POST /api/auth/recuperacao-senha/confirmar` (endpoints dedicados)

Fluxo de "esqueci minha senha", identificando o usuário por e-mail ou RGM.

`POST /api/auth/recuperacao-senha` — Request: `{ "identificador": "joao.lima@aluno.ifsp.edu.br" }`
(aceita e-mail ou RGM). Gera um código, manda por e-mail (ou loga, se for
ambiente de teste) e responde `200` com `{}` — o código em si nunca volta no
corpo em produção (só o mock local, pra demonstração, devolve
`codigoDemo`). `404 USUARIO_NAO_ENCONTRADO` se não achar ninguém com esse
identificador.

`POST /api/auth/recuperacao-senha/confirmar` — Request:
`{ "identificador": "...", "codigo": "123456", "novaSenha": "..." }`.
`200` se der certo. `422 CODIGO_INVALIDO` se o código estiver errado,
expirado, ou não existir nenhum pendente pra esse usuário.

### `GET /api/usuarios/me`

Qualquer perfil autenticado. Serve pra restaurar a sessão quando a página
recarrega e revalidar que o token ainda é válido. Mesmo formato do campo
`usuario` do login. `401` se o token não for mais válido.

**Ainda não é chamado pelo frontend** — hoje o React confia direto no que
está salvo em `localStorage["sgea:session"]` depois do login, sem
revalidar contra o backend a cada reload. Funciona porque o mock nunca
expira. Em modo integrado isso significa que um token expirado só vai
falhar no primeiro request de verdade que a tela fizer (ex: abrir a lista
de eventos), não no carregamento inicial — é um ponto de melhoria futura,
não algo que quebra o fluxo hoje.

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
  palestranteId: string | null;
  cargaHoraria: number;      // horas, aceita decimal — usado no certificado
  perguntas: string[];       // perguntas do questionário de feedback, definidas na criação do evento
}
```

Detalhe pro frontend lembrar quando integrar de verdade: hoje o form de
evento usa `<input type="datetime-local">`, que gera string sem timezone
("2026-09-14T14:00"). Isso precisa ser serializado com offset antes de
mandar pra API — não é conta do backend normalizar isso.

`perguntas` é só a lista de enunciados (`string[]`) cadastrada pelo
admin/secretaria ao criar ou editar o evento — o frontend hoje só oferece a
tela de cadastro dessas perguntas; ele ainda não usa esse campo pra montar
um formulário de resposta na tela de Feedback (ver "Lacunas conhecidas" no
fim deste documento).

- `GET /api/eventos` e `GET /api/eventos/{id}` — qualquer perfil
  autenticado (404 se não existir). É a mesma rota usada pela tela de
  gestão (admin/secretaria) e pela Agenda/listagem de eventos (aluno) — não
  tem uma rota "enxuta" separada pro aluno, ele recebe o objeto `Evento`
  completo (menos o que já é escondido em `Palestrante`, se o frontend um
  dia parar de expandir isso client-side).
- `POST /api/eventos` — admin/secretaria, `201`, `422` se
  `palestranteId`/`salaId` não existirem.
- `PUT /api/eventos/{id}` — admin/secretaria, `200`.
- `DELETE /api/eventos/{id}` — admin/secretaria, `204`.

Aluno chamando POST/PUT/DELETE cai em `403 ACESSO_NEGADO`.

## Palestrantes

O campo `telefone` nunca pode aparecer no JSON pra aluno — nem como
`"telefone": null`, a chave some inteira. Isso é decisão do backend (dois
DTOs, `@JsonView`, o que for mais fácil de manter), baseado no perfil do
token. Não dá pra confiar que o frontend simplesmente não mostra o campo —
hoje ele já esconde na UI (`PalestrantesPage.tsx` tem um `// TODO` marcando
esse ponto), mas o dado ainda vem inteiro do mock, porque o mock não tem
conceito de perfil no meio do caminho.

```ts
// visão admin/secretaria
interface Palestrante {
  id: string;
  nome: string;
  curriculo: string;
  telefone: string;
}

// visão aluno — telefone some, não fica null
interface PalestrantePublico {
  id: string;
  nome: string;
  curriculo: string;
}
```

`GET /api/palestrantes` e `GET /api/palestrantes/{id}` — qualquer perfil
autenticado, telefone incluído ou não dependendo do perfil do token.
POST/PUT/DELETE são admin/secretaria only, aluno toma 403.

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

Cadastro manual de gente sem login próprio (convidado externo, por
exemplo) — gerido só por admin/secretaria. Todo aluno já ganha um
Participante automaticamente no registro, então ele nunca chama esses
endpoints diretamente (a tela de Check-in, que também lê essa lista pra
buscar por nome/e-mail/RGM, é exclusiva de admin/secretaria).

```ts
interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}
```

`GET /api/participantes`, `GET /api/participantes/{id}`, `POST`, `PUT`,
`DELETE` — tudo admin/secretaria only, `403` pra aluno em qualquer verbo.

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
`403` — ele usa o endpoint de autoinscrição abaixo, não esse.

### `PUT /api/inscricoes/{id}` — atualização parcial (admin/secretaria)

É essa mesma rota genérica que o Check-in usa pra confirmar presença ou
marcar ausência — não existe uma rota `/checkin/...` separada. O corpo é
um patch parcial:

- Confirmar presença: `{ "statusPresenca": "PRESENTE", "dataCheckin": "<agora>" }` —
  o backend ignora qualquer `usuarioId` que vier no corpo e seta o do
  token (de quem está fazendo o check-in). É esse evento que libera o
  certificado.
- Marcar ausente: `{ "statusPresenca": "AUSENTE", "dataCheckin": null }`.

Aluno toma `403` em qualquer `PUT`/`DELETE` de inscrição — ele não confirma
a própria presença, isso é sempre feito por quem está na recepção do
evento. A busca de participante por nome/e-mail/RGM na tela de Check-in
também não tem endpoint dedicado: o frontend carrega `GET /api/participantes`
inteiro e filtra no cliente a cada tecla digitada. Funciona para o volume
de dados de uma feira acadêmica; se crescer, um `?busca=` na própria rota
de participantes resolveria sem mudar o frontend.

A exportação de CSV de presença (`gerarCsvPresenca`) é inteiramente
client-side — monta o arquivo em JS a partir da lista de inscrições já
carregada, não bate em endpoint nenhum pra isso.

### `DELETE /api/inscricoes/{id}` (admin/secretaria)

`204`. Aluno toma `403` — não existe fluxo de cancelamento de inscrição
pelo próprio aluno hoje.

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
| 404 | `EVENTO_NAO_ENCONTRADO` | id inexistente |
| 409 | `JA_INSCRITO` | esse aluno já tá inscrito nesse evento |
| 409 | `EVENTO_LOTADO` | capacidade da sala já bateu |

### `POST /api/inscricoes/{id}/confirmacao-email` (endpoint dedicado)

Chamado pelo frontend logo depois que a autoinscrição acima retorna `201`.
Só o dono da inscrição pode disparar (perfil aluno, `participanteId` do
token tem que bater com o da inscrição). Corpo vazio.

Response `200`:
```json
{ "destinatario": "joao.lima@aluno.ifsp.edu.br", "enviadoEm": "2026-08-27T10:00:00-03:00" }
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
`confirmarEmail`) usando `nodemailer`:

```ts
async function confirmarEmail(id: string, participanteIdDoToken: string) {
  const inscricao = await buscarOuFalhar(id);
  if (inscricao.participanteId !== participanteIdDoToken) {
    throw AppError.acessoNegado("Esta inscrição não pertence a você.");
  }

  const participante = participantesStore.buscarPorId(inscricao.participanteId);
  const evento = eventosStore.buscarPorId(inscricao.eventoId);
  if (!participante || !evento) {
    throw AppError.naoEncontrado("INSCRICAO_NAO_ENCONTRADA", "Inscrição não encontrada.");
  }
  const palestrante = evento.palestranteId ? palestrantesStore.buscarPorId(evento.palestranteId) : undefined;

  await emailService.enviarConfirmacaoInscricao(participante.email, {
    participanteNome: participante.nome,
    eventoTitulo: evento.titulo,
    eventoTema: evento.tema,
    palestranteNome: palestrante?.nome ?? "—",
    eventoHorario: new Date(evento.horario),
  });

  return { destinatario: participante.email, enviadoEm: new Date().toISOString() };
}
```

(`buscarOuFalhar`, `participantesStore` e `eventosStore` vêm de
`backend/src/db/store.ts` — o repositório em memória que guarda os dados
enquanto o banco de verdade não é ligado, ver `backend/README.md`.)

`emailService` (`backend/src/modules/email/email.service.ts`) usa um
transporte `nodemailer` configurado por variável de ambiente (`SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — ver `backend/README.md`).
**Sem `SMTP_HOST` configurado, o e-mail não é enviado de verdade — só
impresso no console** (`[e-mail simulado] ...`), o que é o padrão em
desenvolvimento local e evita precisar de uma conta SMTP só pra testar o
fluxo. Se o envio falhar (SMTP fora do ar, credencial errada), a exceção
sobe como erro 500 padrão — não derruba a inscrição, que já foi criada e
persistida antes desse endpoint ser chamado.

## Certificados

Não existe recurso `Certificado` nem endpoint de download — o PDF é gerado
inteiramente no navegador (`jsPDF`), então o backend só precisa expor os
dados de presença corretamente. Tudo aqui reaproveita a rota de Inscrições
de cima:

- **Aluno**: `GET /api/inscricoes?participanteId={o-próprio-id}&status=PRESENTE`
  — o `participanteId` é ignorado/forçado pro do token, igual explicado na
  seção de Inscrições, então na prática o aluno só descobre os certificados
  dele mesmo.
- **Admin/secretaria**: `GET /api/inscricoes?status=PRESENTE` (com
  `eventoId` opcional pra filtrar), pra emitir certificado de qualquer
  participante presente.

O frontend junta `Inscricao` + `Evento` + `Palestrante` + `Participante` no
cliente pra montar o certificado (nome, RGM, evento, tema, palestrante,
data, carga horária) e calcula um "código de validação"
determinístico a partir do `id` da inscrição — isso é só uma referência
impressa no PDF, não existe endpoint pra validar esse código de volta. Se
no futuro quiserem uma verificação de autenticidade de verdade, precisa de
um endpoint novo tipo `GET /api/certificados/validar?codigo=...`; hoje isso
não existe.

Regra central pro backend: um certificado "existe" se, e somente se,
`statusPresenca == "PRESENTE"` na inscrição — não tem outro estado
intermediário nem tabela própria pra isso.

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

Hoje isso é um recurso flat igual os outros — `GET/POST/PUT/DELETE
/api/feedbacks` — porque a tela `FeedbackPage.tsx` ainda não foi adaptada
por perfil (é a mesma tela de gestão pra admin, secretaria e aluno, listada
na seção de lacunas conhecidas no fim deste documento). O comportamento
**correto**, que o backend deve implementar desde já mesmo o frontend
ainda não pedindo:

- Aluno só pode criar feedback com o próprio `participanteId` (backend
  ignora/sobrescreve pelo do token, mesmo padrão de Inscrição) e só edita
  ou lê o próprio — nunca a lista inteira. `422 VALIDACAO` se a nota
  estiver fora de 1-5, `409 FEEDBACK_JA_ENVIADO` se já existe feedback
  desse participante pra esse evento.
- Admin/secretaria continuam com `GET /api/feedbacks?eventoId=` liberado
  pra ver/gerenciar tudo (é o que a tela usa pra calcular a média
  exibida).

## Dashboard

Não existe endpoint dedicado — `DashboardPage.tsx` calcula tudo no cliente
a partir de `GET /api/eventos`, `GET /api/inscricoes` e `GET /api/salas`
(pra ocupação média). Funciona, mas belisca performance se
o volume de dados crescer bastante; um `GET /api/dashboard/estatisticas`
agregando isso no servidor é uma otimização futura razoável, não um
requisito pra este contrato funcionar.

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
| 404 | `*_NAO_ENCONTRADO(A)` | id não existe |
| 409 | `RGM_DUPLICADO` / `EMAIL_DUPLICADO` | conflito de unicidade no cadastro |
| 409 | `JA_INSCRITO` | inscrição duplicada no mesmo evento |
| 409 | `EVENTO_LOTADO` | capacidade da sala esgotada |
| 409 | `FEEDBACK_JA_ENVIADO` | feedback duplicado pro mesmo evento |
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
| `Evento` | fundido com a antiga entidade `Sessao` — ver seção **Eventos**; campos novos: `palestranteId` (nullable), `tema`, `cargaHoraria`, `perguntas` (`string[]`) |
| `Inscricao` | campo `sessaoId` renomeado pra `eventoId` (reflete a fusão acima); campo novo `dataInscricao` |
| `Feedback` | continua flat (`/api/feedbacks`), sem aninhar em `/eventos/{id}/feedback` como uma versão anterior deste documento sugeria |
| `Trabalho` | removido — entidade, tabela e endpoints |
| `Certificado` | não é entidade nem tabela — deriva de Inscrição + presença confirmada, PDF montado no cliente |

## Lacunas conhecidas (frontend ainda não fez, backend não precisa esperar)

- **Feedback sem restrição por perfil** — maior pendência. A tela é
  genérica pros três perfis hoje; o backend deve aplicar a regra da seção
  Feedback mesmo assim, e o frontend alcança depois.
- `GET /api/usuarios/me` documentado mas não chamado ainda (sessão não é
  revalidada no reload, só confia no localStorage).
- Busca de participante no Check-in é client-side (carrega tudo, filtra no
  navegador) — funciona, mas não escala pra uma base grande de dados.
- Sem endpoint de validação de código de certificado (o código impresso no
  PDF é só uma referência visual por enquanto).
- O campo `perguntas` do Evento só tem tela de cadastro (admin/secretaria
  define as perguntas ao criar o evento); ainda não existe tela de resposta
  do questionário nem vínculo entre `perguntas` e o `Feedback` registrado.

## Decisões tomadas na implementação do backend

Estas questões estavam em aberto neste documento e foram resolvidas ao
implementar `backend/` de verdade — registrado aqui pra não ficar só na
cabeça de quem escreveu o código:

- **Política de senha**: mínimo de 8 caracteres, sem outra exigência
  (maiúscula/número/símbolo). Validado em `auth.schemas.ts` tanto no
  registro quanto na redefinição de senha.
- **Domínio do e-mail institucional**: sim, precisa terminar com
  `@aluno.ifsp.edu.br` — mesma regra que já existia no frontend
  (`CadastroPage.tsx`), agora também validada no backend.
- **Atenção**: o formulário de cadastro do frontend (`CadastroPage.tsx`)
  ainda valida só 6 caracteres no cliente — um usuário pode digitar uma
  senha de 6 ou 7 caracteres, passar na validação da tela, e só descobrir
  que não serve quando o backend devolver `422`. Funciona (o erro aparece
  na tela), mas não é a experiência ideal; ajustar o mínimo do frontend pra
  8 fecha essa inconsistência.

## Coisa que ainda não decidimos

- Como fica o provisionamento de conta admin/secretaria (não existe tela
  nem endpoint pra isso — hoje só existem via `backend/src/db/seedData.ts`).
- Se a exportação de CSV de presença migra pro backend ou continua no cliente.
