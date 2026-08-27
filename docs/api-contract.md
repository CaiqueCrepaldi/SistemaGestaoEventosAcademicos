# Contrato de API — Sistema de Gestão de Eventos Acadêmicos

Documento de referência para o desenvolvimento do backend (Java + Spring Boot).
O frontend (React 19 + TypeScript) já está implementado contra um mock local
(`localStorage`) que segue exatamente este contrato — trocar o mock por chamadas
HTTP reais deve ser um swap de uma camada de serviço, sem mudar nada na UI.

Todos os endpoints estão sob o prefixo `/api`. Corpo de requisição e resposta em
JSON, `Content-Type: application/json`, exceto onde indicado (download de
certificado). Nomes de campo em `camelCase` — iguais aos tipos TypeScript do
frontend, para não exigir nenhuma camada de tradução.

---

## 1. Perfis e matriz de permissões

Três perfis: `ADMINISTRADOR`, `SECRETARIA`, `ALUNO`. Administrador e Secretaria
têm acesso total e equivalente a tudo que não seja explicitamente de aluno.
Aluno é um perfil novo, com acesso restrito e auto-cadastro.

| Recurso                              | ADMINISTRADOR | SECRETARIA | ALUNO |
|---------------------------------------|:---:|:---:|:---:|
| Eventos — listar / detalhe             | ✅ | ✅ | ✅ |
| Eventos — criar / editar / excluir     | ✅ | ✅ | ❌ |
| Palestrantes — listar / detalhe        | ✅ (com telefone) | ✅ (com telefone) | ✅ (**sem** telefone) |
| Palestrantes — criar / editar / excluir| ✅ | ✅ | ❌ |
| Salas                                  | ✅ | ✅ | ❌ (nenhum acesso, nem leitura) |
| Sessões — CRUD/gestão                  | ✅ | ✅ | ❌ |
| Agenda (visão derivada de Sessões)     | ✅ | ✅ | ✅ (somente leitura) |
| Participantes (cadastro avulso)        | ✅ | ✅ | ❌ |
| Inscrições — gestão (`/api/inscricoes`)| ✅ | ✅ | ❌ |
| Inscrição — autoinscrição no evento    | ❌* | ❌* | ✅ (apenas a própria) |
| Check-in                               | ✅ | ✅ | ❌ |
| Certificados — emissão/consulta própria| — | — | ✅ (apenas os próprios) |
| Feedback — enviar                      | ❌* | ❌* | ✅ (apenas o próprio) |
| Feedback — listar/consolidar por evento| ✅ | ✅ | ❌ |
| Dashboard / estatísticas               | ✅ | ✅ | ❌ |
| Trabalhos                              | **removido do projeto** | **removido** | **removido** |

`❌*` = não é que seja proibido por regra de negócio, é que o endpoint é
exclusivo do fluxo de aluno (autoinscrição/feedback são sempre "em nome de
quem está logado"; administrador/secretaria usam os endpoints de gestão).

> **Trabalhos foi removido do escopo do projeto.** Não implementar
> `TrabalhoController`/`TrabalhoService`/tabela `trabalhos`. Se algo já foi
> gerado no backend a partir do diagrama antigo, pode ser descartado.

---

## 2. Autenticação

### 2.1 Convenções

- Todas as rotas exceto `POST /api/auth/login` e `POST /api/auth/registro`
  exigem header `Authorization: Bearer <token>`.
- O token é **opaco para o frontend** — o React nunca decodifica o JWT. Todos
  os dados de perfil necessários pra UI (nome, perfil, rgm) vêm no **corpo da
  resposta de login/registro**, não do token. O JWT existe para o backend
  validar autenticação/autorização a cada requisição (filtro do Spring
  Security), não para o cliente ler claims.
- **Toda autorização por perfil deve ser validada no servidor**, em cada
  endpoint (`@PreAuthorize` / regra equivalente), nunca apenas escondendo
  botões/rotas na UI. A UI hoje já esconde telas por perfil, mas isso é só
  cosmético — um `ALUNO` que descobrir a URL de `/api/salas` batendo direto
  com `curl` **precisa** tomar `403`, mesmo que a tela nunca apareça pra ele.

### 2.2 `POST /api/auth/registro` — auto-cadastro de ALUNO

Único perfil com auto-cadastro público. Administrador e Secretaria são
provisionados por outro meio (fora do escopo deste documento — hoje o
frontend não tem tela para isso).

Ao registrar, o backend deve criar **dois registros vinculados**: um
`Usuario` (login) e um `Participante` (usado por inscrição/check-in/agenda,
que já existiam antes do login de aluno existir). Isso mantém o modelo de
Inscrição/Check-in inalterado — ele sempre referenciou `participanteId`.

**Request**
```json
{
  "nomeCompleto": "João Pedro Lima",
  "rgm": "2024010011",
  "emailInstitucional": "joao.lima@aluno.ifsp.edu.br",
  "senha": "SenhaForte123"
}
```

**Response `201 Created`**
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
Senha nunca retorna no corpo, em nenhum endpoint.

**Erros**
| Status | code | Quando |
|---|---|---|
| 409 | `RGM_DUPLICADO` | já existe usuário/participante com esse RGM |
| 409 | `EMAIL_DUPLICADO` | já existe usuário com esse e-mail |
| 422 | `VALIDACAO` | campo obrigatório ausente, e-mail fora do formato institucional, senha fraca (definir política mínima, ex: 8+ caracteres) |

### 2.3 `POST /api/auth/login`

**Request**
```json
{ "emailLogin": "joao.lima@aluno.ifsp.edu.br", "senha": "SenhaForte123" }
```

**Response `200 OK`**
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
Para `ADMINISTRADOR`/`SECRETARIA`, `rgm` e `participanteId` vêm `null`.

**Erros**
| Status | code | Quando |
|---|---|---|
| 401 | `CREDENCIAIS_INVALIDAS` | e-mail ou senha incorretos |

### 2.4 `GET /api/usuarios/me` (qualquer perfil autenticado)

Conveniência para restaurar sessão ao recarregar a página (o frontend guarda
o token e o objeto `usuario` no `localStorage`, mas precisa revalidar).
Retorna o mesmo formato do campo `usuario` do login. `401` se o token for
inválido/expirado.

---

## 3. Eventos

Sem mudanças no modelo. `ADMINISTRADOR`/`SECRETARIA` fazem CRUD completo;
`ALUNO` só lê.

```ts
interface Evento {
  id: string;
  nome: string;
  data: string;        // "2026-09-14" (ISO date, sem hora)
  local: string;
  descricao: string;
}
```

- `GET /api/eventos` — todos os perfis autenticados.
- `GET /api/eventos/{id}` — todos os perfis autenticados. `404` se não existir.
- `POST /api/eventos` — ADMINISTRADOR, SECRETARIA. Body = `Evento` sem `id`. `201`.
- `PUT /api/eventos/{id}` — ADMINISTRADOR, SECRETARIA. Body parcial ou total. `200`.
- `DELETE /api/eventos/{id}` — ADMINISTRADOR, SECRETARIA. `204`.

`ALUNO` chamando `POST`/`PUT`/`DELETE` → `403 ACESSO_NEGADO`.

---

## 4. Palestrantes

**Importante:** o campo `telefone` **nunca** deve aparecer no JSON retornado
para o perfil `ALUNO`. Não mandar `"telefone": null` — omitir a chave. Isso
precisa ser feito no backend (ex: dois DTOs de resposta, `PalestranteDTO` e
`PalestrantePublicoDTO`, ou uma `@JsonView`), decidido pelo perfil do
token — nunca confiar em o frontend simplesmente não exibir o campo.

```ts
// Visão ADMINISTRADOR / SECRETARIA
interface Palestrante {
  id: string;
  nome: string;
  curriculo: string;
  telefone: string;
}

// Visão ALUNO — telefone omitido, não nulo
interface PalestrantePublico {
  id: string;
  nome: string;
  curriculo: string;
}
```

**`GET /api/palestrantes`**

Resposta para ADMINISTRADOR/SECRETARIA:
```json
[
  { "id": "p1", "nome": "Dra. Mariana Costa", "curriculo": "Doutora em IA...", "telefone": "(11) 98888-1111" }
]
```

Resposta para ALUNO (mesmo endpoint, mesmo evento, corpo diferente):
```json
[
  { "id": "p1", "nome": "Dra. Mariana Costa", "curriculo": "Doutora em IA..." }
]
```

- `GET /api/palestrantes/{id}` — mesma regra de omissão condicional.
- `POST /api/palestrantes`, `PUT /api/palestrantes/{id}`, `DELETE /api/palestrantes/{id}`
  — ADMINISTRADOR, SECRETARIA. `ALUNO` → `403`.

---

## 5. Salas

Sem exposição nenhuma para `ALUNO` — nem leitura (a capacidade da sala é
usada para calcular vagas, mas isso é resolvido no backend ao processar a
inscrição; o aluno nunca precisa consultar `/api/salas` diretamente).

```ts
interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}
```

- `GET /api/salas`, `GET /api/salas/{id}` — ADMINISTRADOR, SECRETARIA. `ALUNO` → `403`.
- `POST /api/salas`, `PUT /api/salas/{id}`, `DELETE /api/salas/{id}` — ADMINISTRADOR, SECRETARIA.

---

## 6. Sessões

**Campos novos** (não existiam): `palestranteId` (obrigatório), `tema`,
`cargaHoraria`.

```ts
interface Sessao {
  id: string;
  eventoId: string;
  titulo: string;         // ex: "Minicurso: Arquitetura de Microsserviços"
  tema: string;            // ex: "Arquitetura de Software" — assunto/trilha da sessão
  horario: string;         // ISO-8601 com offset: "2026-09-14T14:00:00-03:00"
  salaId: string;
  palestranteId: string;   // obrigatório agora
  cargaHoraria: number;    // horas, aceita decimal (ex: 1.5)
}
```

> **Nota de migração para o frontend:** hoje o formulário de sessão usa
> `<input type="datetime-local">`, que gera string sem timezone
> (`"2026-09-14T14:00"`). Ao integrar com a API real, o frontend precisa
> serializar isso com o offset local antes de enviar. Ficar ciente ao
> revisar o PR de integração — não é responsabilidade do backend normalizar
> isso.

Endpoints de **gestão** (tela "Sessões"), exclusivos de ADMINISTRADOR/SECRETARIA:

- `GET /api/sessoes?eventoId=` (filtro opcional) — lista completa, com todos os campos.
- `GET /api/sessoes/{id}`
- `POST /api/sessoes` — `422` se `palestranteId`/`salaId`/`eventoId` não existirem.
- `PUT /api/sessoes/{id}`
- `DELETE /api/sessoes/{id}`

`ALUNO` não acessa `/api/sessoes` **em nenhum verbo** (nem `GET`) — ele vê
sessões apenas através da Agenda (§8) e do detalhe do evento, que retornam um
formato mais enxuto, sem exigir que o aluno tenha visibilidade sobre a
gestão interna de salas/sessões.

---

## 7. Participantes

Cadastro "manual" de participantes avulsos (quem não é aluno com login, ex:
convidados externos). Continua existindo e sendo gerido só por
ADMINISTRADOR/SECRETARIA. Todo `ALUNO` autenticado já tem um `Participante`
criado automaticamente no registro (§2.2) — ele nunca chama estes endpoints.

```ts
interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}
```

- `GET /api/participantes`, `GET /api/participantes/{id}` — ADMINISTRADOR, SECRETARIA.
- `POST /api/participantes`, `PUT /api/participantes/{id}`, `DELETE /api/participantes/{id}` — ADMINISTRADOR, SECRETARIA.
- `ALUNO` → `403` em qualquer verbo.

---

## 8. Inscrições

Dois fluxos completamente separados: **autoinscrição** (aluno) e **gestão**
(administrador/secretaria). Não é a mesma rota com permissões diferentes —
são rotas diferentes, porque o corpo da requisição também muda (o aluno
nunca informa `participanteId`, ele vem do token).

```ts
type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

interface Inscricao {
  id: string;
  participanteId: string;
  sessaoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;   // ISO-8601, setado só no check-in
  usuarioId: string | null;     // quem fez o check-in (staff), não quem se inscreveu
  dataInscricao: string;        // ISO-8601, novo campo — quando o aluno se inscreveu
}
```

### 8.1 Autoinscrição (ALUNO)

`POST /api/eventos/{eventoId}/sessoes/{sessaoId}/inscricoes`

**Request:** corpo vazio (`{}`). O backend **ignora** qualquer
`participanteId` que porventura venha no corpo — sempre usa o
`participanteId` do token autenticado. Isso é uma regra de segurança, não só
de conveniência: um aluno não pode se inscrever em nome de outro forjando o
corpo da requisição.

**Response `201 Created`**
```json
{
  "id": "i9",
  "participanteId": "9c1a4d2e-participante-uuid",
  "sessaoId": "se2",
  "statusPresenca": "PENDENTE",
  "dataCheckin": null,
  "usuarioId": null,
  "dataInscricao": "2026-09-01T10:00:00-03:00"
}
```

Efeito colateral: dispara e-mail de confirmação de inscrição para o
`emailLogin` do aluno (assíncrono — a resposta HTTP não espera o envio).

**Erros**
| Status | code | Quando |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | sem token / token inválido |
| 403 | `ACESSO_NEGADO` | token válido mas perfil ≠ ALUNO |
| 404 | `EVENTO_NAO_ENCONTRADO` / `SESSAO_NAO_ENCONTRADA` | ids inexistentes, ou `sessaoId` não pertence ao `eventoId` da URL |
| 409 | `JA_INSCRITO` | já existe inscrição desse aluno nessa sessão |
| 409 | `SESSAO_LOTADA` | inscritos na sessão já atingiram a capacidade da sala |

`GET /api/alunos/me/inscricoes` — ALUNO, lista as próprias inscrições
(join com sessão/evento, para a tela de "minhas inscrições" e para o
detalhe do evento saber se o aluno já está inscrito em alguma sessão dele):
```json
[
  {
    "inscricaoId": "i9",
    "sessaoId": "se2",
    "sessaoTitulo": "Minicurso: Arquitetura de Microsserviços",
    "horario": "2026-09-14T14:00:00-03:00",
    "eventoId": "e1",
    "eventoNome": "Semana Acadêmica de Tecnologia 2026",
    "statusPresenca": "PENDENTE"
  }
]
```

### 8.2 Gestão (ADMINISTRADOR, SECRETARIA)

- `GET /api/inscricoes?eventoId=&sessaoId=&participanteId=` — filtros opcionais, sem paginação por ora (igual ao comportamento atual do frontend, que carrega tudo).
- `POST /api/inscricoes` — inscrição manual feita pela secretaria. Body:
  ```json
  { "participanteId": "pa3", "sessaoId": "se2" }
  ```
  Mesmas regras de conflito (`JA_INSCRITO`, `SESSAO_LOTADA`) que a autoinscrição.
- `DELETE /api/inscricoes/{id}` — `204`.

`ALUNO` → `403` em todos os verbos desta seção.

---

## 9. Check-in

Exclusivo de ADMINISTRADOR/SECRETARIA. `ALUNO` → `403` em tudo abaixo,
inclusive `GET` (não é só "não tem botão", o endpoint em si deve recusar).

- `GET /api/checkin/busca?termo=` — busca participante por nome/e-mail/RGM.
  ```json
  [{ "id": "pa1", "nome": "João Pedro Lima", "email": "joao.lima@aluno.ifsp.edu.br", "rgm": "2024010011" }]
  ```
- `GET /api/checkin/participantes/{participanteId}/inscricoes` — inscrições daquele participante, mesmo formato do §8.1 (`GET /api/alunos/me/inscricoes`), mas parametrizado por id porque quem chama é a secretaria olhando qualquer aluno, não "a si mesma".
- `POST /api/checkin/inscricoes/{inscricaoId}/confirmar` — corpo vazio. Seta `statusPresenca = PRESENTE`, `dataCheckin = now()`, `usuarioId = <id do usuário logado que está fazendo o check-in>` (do token, não do corpo). **É esse evento que libera o certificado** (§10). Resposta `200` com a `Inscricao` atualizada.
- `POST /api/checkin/inscricoes/{inscricaoId}/ausente` — marca `AUSENTE`, `dataCheckin = null`.
- `GET /api/checkin/sessoes/{sessaoId}/exportar` — `Content-Type: text/csv`, mesmas colunas que o frontend já monta hoje no cliente (Nome, E-mail, RGM, Sessão, Status, Check-in). Mover essa geração pro backend é opcional — pode continuar sendo montada no frontend a partir do `GET /api/checkin/participantes/{id}/inscricoes` em lote; documentado aqui como o formato esperado caso decidam mover a geração pro servidor.

---

## 10. Certificados (recurso novo)

Regra de negócio central: **certificado só existe/é liberado se
`statusPresenca == "PRESENTE"`** na inscrição correspondente. Antes disso, o
aluno não tem nada pra baixar.

`GET /api/alunos/me/certificados` — ALUNO, lista o que está disponível:
```json
[
  {
    "inscricaoId": "i1",
    "eventoId": "e1",
    "eventoNome": "Semana Acadêmica de Tecnologia 2026",
    "sessaoId": "se1",
    "sessaoTitulo": "Abertura e Palestra Magna: IA na Educação",
    "cargaHoraria": 2,
    "dataCheckin": "2026-09-14T09:05:00-03:00",
    "certificadoDisponivel": true
  }
]
```
Inclui também as inscrições `PENDENTE`/`AUSENTE` com `certificadoDisponivel: false`,
para a tela poder mostrar "presença não confirmada" em vez de simplesmente
omitir a sessão.

`GET /api/certificados/{inscricaoId}/download` — ALUNO, apenas se
`inscricaoId` pertencer ao próprio `participanteId` do token.
- Resposta `200`: `Content-Type: application/pdf`, corpo binário do certificado.
- `403 ACESSO_NEGADO` — a inscrição existe mas é de outro participante.
- `404 INSCRICAO_NAO_ENCONTRADA` — id inexistente.
- `409 PRESENCA_NAO_CONFIRMADA` — inscrição existe, é do aluno, mas `statusPresenca != PRESENTE`.

Geração do PDF (template, dados institucionais etc.) fica a critério de
quem implementar — fora do escopo deste contrato, que só define o
comportamento observável da API.

---

## 11. Feedback

```ts
interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;        // 1 a 5
  comentario: string;
}
```

- `POST /api/eventos/{eventoId}/feedback` — ALUNO. Body:
  ```json
  { "nota": 5, "comentario": "Evento muito bem organizado." }
  ```
  `participanteId` vem do token, igual à inscrição — nunca do corpo.
  - `422 VALIDACAO` — `nota` fora do intervalo 1-5, ou ausente.
  - `409 FEEDBACK_JA_ENVIADO` — esse aluno já avaliou esse evento.
- `GET /api/eventos/{eventoId}/feedback/me` — ALUNO, retorna o próprio
  feedback daquele evento (`404` se ainda não enviou) — usado pra tela saber
  se mostra o formulário ou o feedback já dado.
- `GET /api/eventos/{eventoId}/feedback` — ADMINISTRADOR, SECRETARIA. Lista
  todos + é usado para calcular a média (o cálculo pode continuar no
  frontend a partir da lista, como hoje, ou o backend pode expor um campo
  `mediaNotas` agregado — a decidir por quem implementar).

`ALUNO` → `403` em `GET /api/eventos/{eventoId}/feedback` (visão agregada é
só de gestão).

---

## 12. Dashboard

Exclusivo de ADMINISTRADOR/SECRETARIA. `ALUNO` → `403`.

`GET /api/dashboard/estatisticas`
```json
{
  "totalEventos": 2,
  "totalInscricoes": 4,
  "totalPresentes": 1,
  "taxaPresenca": 25.0,
  "ocupacaoMedia": 2.0
}
```

---

## 13. Formato padrão de erro

Todo erro (qualquer status 4xx/5xx) segue o mesmo envelope:

```json
{
  "timestamp": "2026-08-25T14:32:00-03:00",
  "status": 409,
  "code": "RGM_DUPLICADO",
  "message": "Já existe um cadastro com este RGM.",
  "path": "/api/auth/registro"
}
```

Para `422` (validação de campos), inclui detalhamento por campo:

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

### Códigos usados neste documento

| Status | code | Significado |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | token ausente, inválido ou expirado |
| 401 | `CREDENCIAIS_INVALIDAS` | login/senha incorretos |
| 403 | `ACESSO_NEGADO` | autenticado, mas perfil sem permissão para o recurso |
| 404 | `*_NAO_ENCONTRADO(A)` | id não existe |
| 409 | `RGM_DUPLICADO` / `EMAIL_DUPLICADO` | conflito de unicidade no cadastro |
| 409 | `JA_INSCRITO` | inscrição duplicada na mesma sessão |
| 409 | `SESSAO_LOTADA` | capacidade da sala esgotada |
| 409 | `FEEDBACK_JA_ENVIADO` | feedback duplicado pro mesmo evento |
| 409 | `PRESENCA_NAO_CONFIRMADA` | tentativa de baixar certificado sem check-in |
| 422 | `VALIDACAO` | corpo da requisição com campo inválido/ausente |

`401` sempre que o token estiver ausente/expirado/inválido — antes de
qualquer verificação de perfil. `403` só depois de confirmar que o token é
válido mas o perfil não tem permissão. Não misturar os dois (não retornar
`404` pra esconder um `403` neste projeto — não há esse requisito de
sigilo de existência de recurso aqui).

---

## 14. Resumo do que muda no modelo de dados atual

| Entidade | Mudança |
|---|---|
| `Usuario` | novo perfil `ALUNO`; novos campos `rgm` (nullable, só ALUNO) e `participanteId` (nullable, só ALUNO) |
| `Sessao` | novos campos obrigatórios: `palestranteId`, `tema`, `cargaHoraria` |
| `Inscricao` | novo campo `dataInscricao` |
| `Trabalho` | **removido** (entidade, tabela e endpoints) |
| `Certificado` | recurso novo, não é uma tabela obrigatória — pode ser derivado de `Inscricao` (presença confirmada) + geração sob demanda, ou persistido, a critério de quem implementar |

---

## 15. Em aberto (decisões de quem implementar o backend)

- Política de força de senha exata (definimos só "mínimo 8 caracteres" como piso).
- Formato/validação do domínio de e-mail institucional (ex: exigir `@aluno.ifsp.edu.br`?).
- Provisionamento de contas `ADMINISTRADOR`/`SECRETARIA` (não há tela para isso hoje).
- Se `mediaNotas` do evento é calculada no backend ou no frontend a partir da lista de feedbacks.
- Se a geração de CSV de presença migra pro backend ou continua sendo montada no frontend a partir dos dados já retornados pelo check-in.
- Template/geração do PDF do certificado.
