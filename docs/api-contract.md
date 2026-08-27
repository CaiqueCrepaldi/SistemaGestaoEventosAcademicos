# Contrato de API — Sistema de Gestão de Eventos Acadêmicos

Referência pra quem for implementar o backend (Java + Spring Boot). O
frontend já roda hoje contra um mock em `localStorage` que segue esse mesmo
contrato, então trocar por chamadas HTTP reais é só trocar a camada de
serviço — a UI não muda.

Prefixo `/api` em tudo. JSON, `camelCase` igual aos tipos do frontend (não
tem tradução de nome de campo no meio do caminho). A única exceção de
formato é o download de certificado, que é binário.

## Perfis e permissões

Três perfis: `ADMINISTRADOR`, `SECRETARIA` e `ALUNO`. Os dois primeiros têm
acesso igual e total a tudo que não for exclusivo de aluno. Aluno é o perfil
novo, com acesso restrito e auto-cadastro.

| Recurso                              | ADMINISTRADOR | SECRETARIA | ALUNO |
|---------------------------------------|:---:|:---:|:---:|
| Eventos — listar / detalhe             | ✅ | ✅ | ✅ |
| Eventos — criar / editar / excluir     | ✅ | ✅ | ❌ |
| Palestrantes — listar / detalhe        | com telefone | com telefone | sem telefone |
| Palestrantes — criar / editar / excluir| ✅ | ✅ | ❌ |
| Salas                                  | ✅ | ✅ | ❌ (nem leitura) |
| Sessões — CRUD/gestão                  | ✅ | ✅ | ❌ |
| Agenda (derivada de Sessões)           | ✅ | ✅ | leitura |
| Participantes (cadastro avulso)        | ✅ | ✅ | ❌ |
| Inscrições — gestão                    | ✅ | ✅ | ❌ |
| Autoinscrição no evento                | — | — | ✅ (só a própria) |
| Check-in                               | ✅ | ✅ | ❌ |
| Certificados                           | — | — | ✅ (só os próprios) |
| Feedback — enviar                      | — | — | ✅ (só o próprio) |
| Feedback — listar por evento           | ✅ | ✅ | ❌ |
| Dashboard / estatísticas               | ✅ | ✅ | ❌ |
| Trabalhos                              | removido do projeto | removido | removido |

Autoinscrição e feedback aparecem sem admin/secretaria não porque sejam
proibidos, mas porque esses endpoints são sempre "em nome de quem está
logado" — administrador e secretaria usam os endpoints de gestão pra isso.

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
aluno batendo direto em `/api/salas` via curl precisa tomar 403 mesmo que
aquela tela nunca apareça pra ele.

### `POST /api/auth/registro` — auto-cadastro de aluno

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

### `POST /api/auth/login`

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

### `GET /api/usuarios/me`

Qualquer perfil autenticado. Serve pra restaurar a sessão quando a página
recarrega (o frontend guarda token + usuário no localStorage, mas precisa
revalidar contra o backend). Mesmo formato do campo `usuario` do login.
`401` se o token não for mais válido.

## Eventos

Modelo não muda. Admin/secretaria fazem CRUD completo, aluno só lê.

```ts
interface Evento {
  id: string;
  nome: string;
  data: string;        // "2026-09-14"
  local: string;
  descricao: string;
}
```

- `GET /api/eventos` e `GET /api/eventos/{id}` — qualquer perfil autenticado (404 se não existir).
- `POST /api/eventos` — admin/secretaria, `201`.
- `PUT /api/eventos/{id}` — admin/secretaria, `200`.
- `DELETE /api/eventos/{id}` — admin/secretaria, `204`.

Aluno chamando POST/PUT/DELETE cai em `403 ACESSO_NEGADO`.

## Palestrantes

O campo `telefone` nunca pode aparecer no JSON pra aluno — nem como
`"telefone": null`, a chave some inteira. Isso é decisão do backend (dois
DTOs, `@JsonView`, o que for mais fácil de manter), baseado no perfil do
token. Não dá pra confiar que o frontend simplesmente não mostra o campo.

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

`GET /api/palestrantes` pra admin/secretaria:
```json
[{ "id": "p1", "nome": "Dra. Mariana Costa", "curriculo": "Doutora em IA...", "telefone": "(11) 98888-1111" }]
```

O mesmo endpoint pra aluno:
```json
[{ "id": "p1", "nome": "Dra. Mariana Costa", "curriculo": "Doutora em IA..." }]
```

`GET /api/palestrantes/{id}` segue a mesma regra. POST/PUT/DELETE são
admin/secretaria only, aluno toma 403.

## Salas

Aluno não tem acesso nenhum, nem leitura — a capacidade da sala entra só no
cálculo de vagas quando alguém se inscreve, resolvido inteiramente no
backend. O aluno nunca precisa saber que sala existe.

```ts
interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}
```

CRUD completo restrito a admin/secretaria; qualquer verbo com aluno é 403.

## Sessões

Campos novos que não existiam antes: `palestranteId` (obrigatório), `tema`,
`cargaHoraria`.

```ts
interface Sessao {
  id: string;
  eventoId: string;
  titulo: string;         // "Minicurso: Arquitetura de Microsserviços"
  tema: string;            // "Arquitetura de Software" — assunto/trilha
  horario: string;         // ISO-8601 com offset: "2026-09-14T14:00:00-03:00"
  salaId: string;
  palestranteId: string;
  cargaHoraria: number;    // horas, aceita decimal
}
```

Detalhe pro frontend lembrar quando integrar de verdade: hoje o form de
sessão usa `<input type="datetime-local">`, que gera string sem timezone
("2026-09-14T14:00"). Isso precisa ser serializado com offset antes de
mandar pra API — não é conta do backend normalizar isso.

Endpoints de gestão (tela "Sessões"), só admin/secretaria:
- `GET /api/sessoes?eventoId=` (filtro opcional)
- `GET /api/sessoes/{id}`
- `POST /api/sessoes` — 422 se `palestranteId`/`salaId`/`eventoId` não existirem
- `PUT /api/sessoes/{id}`
- `DELETE /api/sessoes/{id}`

Aluno não acessa `/api/sessoes` em nenhum verbo, nem GET. Ele vê sessão só
através da Agenda e do detalhe do evento, que devolvem um formato mais
enxuto sem expor gestão interna de sala.

## Participantes

Cadastro manual de gente sem login próprio (convidado externo, por
exemplo) — continua existindo, gerido só por admin/secretaria. Todo aluno
já ganha um Participante automaticamente no registro, então nunca chama
esses endpoints diretamente.

```ts
interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}
```

CRUD completo pra admin/secretaria, 403 pra aluno em qualquer verbo.

## Inscrições

Dois fluxos separados de propósito: autoinscrição (aluno) e gestão
(admin/secretaria). Não é a mesma rota com regra de permissão diferente —
são rotas diferentes mesmo, porque o corpo muda: o aluno nunca manda
`participanteId`, ele vem do token.

```ts
type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

interface Inscricao {
  id: string;
  participanteId: string;
  sessaoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;   // setado só no check-in
  usuarioId: string | null;     // quem fez o check-in, não quem se inscreveu
  dataInscricao: string;        // novo campo, data da autoinscrição
}
```

**Autoinscrição** — `POST /api/eventos/{eventoId}/sessoes/{sessaoId}/inscricoes`,
corpo vazio. O backend ignora qualquer `participanteId` que vier no corpo,
sempre usa o do token — não é só conveniência, é o que impede um aluno de
se inscrever em nome de outro forjando a requisição.

Response `201`:
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

Esse endpoint não dispara e-mail nenhum sozinho. O frontend chama, em
seguida, o endpoint de confirmação por e-mail (documentado logo abaixo)
passando o `id` que voltou aqui. Separar os dois dá pra tela mostrar "inscrito,
mas o e-mail falhou" em vez de um POST monolítico que ou faz tudo ou nada.

Erros:
| Status | code | Quando |
|---|---|---|
| 401 | `NAO_AUTENTICADO` | sem token / token inválido |
| 403 | `ACESSO_NEGADO` | token válido mas perfil não é aluno |
| 404 | `EVENTO_NAO_ENCONTRADO` / `SESSAO_NAO_ENCONTRADA` | id inexistente, ou sessão não pertence ao evento da URL |
| 409 | `JA_INSCRITO` | esse aluno já tá inscrito nessa sessão |
| 409 | `SESSAO_LOTADA` | capacidade da sala já bateu |

### `POST /api/inscricoes/{id}/confirmacao-email`

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

O corpo do e-mail junta dados de três lugares (inscrição → sessão → evento
→ palestrante), então faz sentido resolver tudo isso no service antes de
montar a mensagem em vez de espalhar query em cada camada. Um jeito direto
com `JavaMailSender` (já vem pronto no starter `spring-boot-starter-mail`):

```java
@Service
public class ConfirmacaoInscricaoEmailService {

    private final JavaMailSender mailSender;
    private final InscricaoRepository inscricaoRepository;

    public ConfirmacaoInscricaoEmailService(JavaMailSender mailSender, InscricaoRepository inscricaoRepository) {
        this.mailSender = mailSender;
        this.inscricaoRepository = inscricaoRepository;
    }

    public ConfirmacaoEmailResponse enviar(String inscricaoId, String participanteIdDoToken) {
        Inscricao inscricao = inscricaoRepository.findComSessaoEEventoById(inscricaoId)
                .orElseThrow(() -> new NaoEncontradoException("INSCRICAO_NAO_ENCONTRADA"));

        if (!inscricao.getParticipante().getId().equals(participanteIdDoToken)) {
            throw new AcessoNegadoException("ACESSO_NEGADO");
        }

        String destinatario = inscricao.getParticipante().getEmail();
        String assunto = "Inscrição confirmada — " + inscricao.getSessao().getEvento().getNome();
        String corpo = montarCorpoHtml(inscricao);

        MimeMessage mensagem = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mensagem, "UTF-8");
        helper.setTo(destinatario);
        helper.setSubject(assunto);
        helper.setText(corpo, true); // true = HTML
        mailSender.send(mensagem);

        return new ConfirmacaoEmailResponse(destinatario, OffsetDateTime.now());
    }

    private String montarCorpoHtml(Inscricao inscricao) {
        // se o projeto já usa Thymeleaf, troca isso por
        // templateEngine.process("email/confirmacao-inscricao", contexto)
        return """
            <p>Olá, %s!</p>
            <p>Sua inscrição em <strong>%s</strong> foi confirmada.</p>
            <p><strong>Sessão:</strong> %s<br>
               <strong>Tema:</strong> %s<br>
               <strong>Palestrante:</strong> %s<br>
               <strong>Data/horário:</strong> %s</p>
            <p>Até lá!</p>
            """.formatted(
                inscricao.getParticipante().getNome(),
                inscricao.getSessao().getEvento().getNome(),
                inscricao.getSessao().getTitulo(),
                inscricao.getSessao().getTema(),
                inscricao.getSessao().getPalestrante().getNome(),
                inscricao.getSessao().getHorarioFormatado()
        );
    }
}
```

Configuração do `application.properties` pra usar um SMTP de verdade (ou o
Mailtrap/Ethereal pra testar sem mandar e-mail de verdade em dev):

```properties
spring.mail.host=smtp.exemplo.com
spring.mail.port=587
spring.mail.username=${MAIL_USERNAME}
spring.mail.password=${MAIL_PASSWORD}
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
```

Se o envio falhar (SMTP fora do ar, credencial errada), não precisa
derrubar a inscrição que já foi criada — devolve `502` ou loga e deixa o
aluno tentar reenviar depois é uma decisão de produto que fica em aberto,
mas a inscrição em si já está válida antes desse endpoint ser chamado.

`GET /api/alunos/me/inscricoes` (aluno) lista as próprias inscrições, já
com sessão/evento juntados — usado tanto na tela de "minhas inscrições"
quanto no detalhe do evento pra saber se o aluno já tá inscrito em algo ali:
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

**Gestão** (admin/secretaria):
- `GET /api/inscricoes?eventoId=&sessaoId=&participanteId=` — filtros opcionais, sem paginação (igual o frontend faz hoje, carrega tudo de uma vez).
- `POST /api/inscricoes` — inscrição manual feita pela secretaria: `{ "participanteId": "pa3", "sessaoId": "se2" }`, mesmas regras de conflito da autoinscrição.
- `DELETE /api/inscricoes/{id}` — `204`.

Aluno toma 403 em qualquer verbo dessa parte.

## Check-in

Exclusivo admin/secretaria, aluno toma 403 em tudo — inclusive GET, não é
só questão de esconder botão.

- `GET /api/checkin/busca?termo=` — busca por nome/e-mail/RGM.
- `GET /api/checkin/participantes/{participanteId}/inscricoes` — mesmo formato do endpoint "minhas inscrições", só que a secretaria passa o id de quem ela quer olhar.
- `POST /api/checkin/inscricoes/{inscricaoId}/confirmar` — corpo vazio, seta `statusPresenca = PRESENTE`, `dataCheckin = now()`, `usuarioId` do token (de quem tá fazendo o check-in, não do corpo). É esse evento que libera o certificado. Retorna `200` com a inscrição atualizada.
- `POST /api/checkin/inscricoes/{inscricaoId}/ausente` — marca `AUSENTE`, zera `dataCheckin`.
- `GET /api/checkin/sessoes/{sessaoId}/exportar` — CSV com as mesmas colunas que o frontend já monta hoje (Nome, E-mail, RGM, Sessão, Status, Check-in). Mover isso pro backend é opcional, dá pra continuar montando no cliente a partir da lista de inscrições.

## Certificados

Regra central: certificado só existe se `statusPresenca == "PRESENTE"` na
inscrição. Antes disso não tem nada pra baixar.

`GET /api/alunos/me/certificados` (aluno) lista o que já tem disponível:
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
Inclui também as inscrições PENDENTE/AUSENTE com `certificadoDisponivel:
false`, pra tela mostrar "presença não confirmada" em vez de simplesmente
sumir com a sessão da lista.

`GET /api/certificados/{inscricaoId}/download` — só se a inscrição for do
próprio aluno (checado pelo `participanteId` do token). Devolve
`application/pdf` em `200`. `403` se a inscrição for de outra pessoa, `404`
se o id não existir, `409 PRESENCA_NAO_CONFIRMADA` se a presença ainda não
foi confirmada.

Como o PDF é gerado (template, dados institucionais) fica por conta de quem
implementar — aqui só importa o comportamento observável da API.

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

- `POST /api/eventos/{eventoId}/feedback` (aluno) — `{ "nota": 5, "comentario": "..." }`, `participanteId` vem do token igual na inscrição. `422 VALIDACAO` se a nota estiver fora de 1-5, `409 FEEDBACK_JA_ENVIADO` se o aluno já avaliou esse evento.
- `GET /api/eventos/{eventoId}/feedback/me` (aluno) — o próprio feedback daquele evento, `404` se ainda não mandou. Serve pra tela decidir entre mostrar o form ou o feedback já dado.
- `GET /api/eventos/{eventoId}/feedback` (admin/secretaria) — lista tudo, usado pra calcular a média (pode ficar no frontend a partir da lista, como é hoje, ou o backend já manda um `mediaNotas` pronto — tanto faz).

Aluno toma 403 nessa listagem agregada.

## Dashboard

`GET /api/dashboard/estatisticas`, admin/secretaria only:
```json
{
  "totalEventos": 2,
  "totalInscricoes": 4,
  "totalPresentes": 1,
  "taxaPresenca": 25.0,
  "ocupacaoMedia": 2.0
}
```

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
| 409 | `JA_INSCRITO` | inscrição duplicada na mesma sessão |
| 409 | `SESSAO_LOTADA` | capacidade da sala esgotada |
| 409 | `FEEDBACK_JA_ENVIADO` | feedback duplicado pro mesmo evento |
| 409 | `PRESENCA_NAO_CONFIRMADA` | tentou baixar certificado sem check-in |
| 422 | `VALIDACAO` | campo inválido/ausente no corpo |

401 é sempre token ausente/inválido/expirado, antes de qualquer checagem de
perfil. 403 só depois de confirmar que o token é válido mas o perfil não
tem permissão — não misturar os dois, e não usar 404 pra esconder um 403
(esse projeto não tem esse tipo de exigência de sigilo).

## O que muda no modelo atual

| Entidade | Mudança |
|---|---|
| `Usuario` | perfil novo `ALUNO`; campos novos `rgm` e `participanteId` (nullable, só ALUNO) |
| `Sessao` | campos novos obrigatórios: `palestranteId`, `tema`, `cargaHoraria` |
| `Inscricao` | campo novo `dataInscricao` |
| `Trabalho` | removido — entidade, tabela e endpoints |
| `Certificado` | recurso novo, não precisa ser tabela — pode derivar de Inscrição + presença confirmada, ou ser persistido, como preferir |

## Coisa que ainda não decidimos

- Política exata de senha (só definimos "8 caracteres" como piso).
- Se o e-mail institucional precisa bater com um domínio específico tipo `@aluno.ifsp.edu.br`.
- Como fica o provisionamento de conta admin/secretaria (não existe tela pra isso ainda).
- Se `mediaNotas` do evento é calculado no backend ou no frontend.
- Se a exportação de CSV de presença migra pro backend ou continua no cliente.
- Template/geração do PDF do certificado.
