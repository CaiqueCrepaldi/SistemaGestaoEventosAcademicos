# Matriz de perfis e permissões — SGEA

**Data:** 09/11/2026 · **Versão:** 7 (calendário de eventos: o professor vê
os eventos dos outros só como "Sala ocupada". A versão 6, do mesmo dia, trouxe o
check-in pedido pelo aluno e decidido pelo professor do evento ou pela equipe.
A versão 5, do mesmo dia, trouxe as
propostas de alteração, o questionário travado e a inativação do professor, na
seção "Perfil PROFESSOR". A versão 4, do
mesmo dia, trouxe o perfil PROFESSOR e a aprovação de eventos e palestrantes
pela equipe. A versão 3, de
29/09/2026, trouxe o 2FA opcional para todos os perfis,
regras novas de feedback e de inativação; a versão 2, de 28/09/2026,
incluiu as rotas do 2FA, do limite de tentativas e do aceite versionado)

Gerada diretamente das rotas reais do backend (`backend/src/modules/*/*.routes.ts`
e `backend/src/middleware/auth.ts`), não de uma descrição informal do
sistema. Toda rota autenticada exige `Authorization: Bearer <token>`
(middleware `autenticar`); "ADMINISTRADOR"/"SECRETARIA" nas colunas
significa que o middleware `autorizar(...)` barra qualquer outro perfil com
`403 ACESSO_NEGADO` antes de a rota executar.

Além de assinatura e prazo, `autenticar` recusa com `401` o token
temporário da etapa do 2FA (só serve na rota da própria etapa) e a sessão
invalidada depois de emitida (versão de token).

## Rotas públicas (sem autenticação)

| Rota | Método | Quem acessa | Observação |
|---|---|---|---|
| `/api/auth/registro` | POST | Qualquer pessoa | Cria `Participante` + `Usuario` (perfil `ALUNO`); exige `aceiteLgpd: true`; grava data/hora e versão dos Termos/Política aceitos |
| `/api/auth/login` | POST | Qualquer pessoa | Sem 2FA: devolve a sessão (JWT). Com 2FA ativo (qualquer perfil que tenha ativado): devolve só o token temporário "2FA pendente" (5 min). Aluno inativado: `403 CONTA_INATIVA` "Sua conta está inativa. Procure a secretaria.", sem o motivo. Limite de 5 tentativas por conta e por IP |
| `/api/auth/recuperacao-senha` | POST | Qualquer pessoa | Limite de 5 pedidos por conta e por IP. **Responde `404` quando o e-mail não está cadastrado** — limitação registrada em `07-medidas-tecnicas-de-seguranca.md` |
| `/api/auth/primeiro-acesso` | POST | Qualquer pessoa | Ativa a conta de professor: código de 6 dígitos (vale 24 h, 5 tentativas), senha nova e `aceiteLgpd: true`. E-mail sem conta e código errado recebem o mesmo `422 CODIGO_INVALIDO`; limite por IP |
| `/api/auth/recuperacao-senha/confirmar` | POST | Qualquer pessoa | Exige código válido, não vencido, dentro do limite de tentativas; encerra as sessões abertas da conta |

## Rota da etapa do 2FA (só com o token temporário)

| Rota | Método | Token aceito | Observação |
|---|---|---|---|
| `/api/auth/2fa/verificar` | POST | Só "2FA pendente" | Código do aplicativo ou código de recuperação; limite de 5 tentativas por conta; devolve a sessão |

## Rotas autenticadas

| Rota | Método | ADMINISTRADOR | SECRETARIA | ALUNO | Regra de propriedade |
|---|---|:---:|:---:|:---:|---|
| `/api/usuarios/me` | GET | ✅ | ✅ | ✅ | Sempre os dados do próprio token (`req.usuario.sub`) — não existe `GET /usuarios/:id` |
| `/api/usuarios/:id/bloqueio` | DELETE | ✅ | ❌ | ❌ | Remove o bloqueio por tentativas da conta (login, recuperação de senha e código do 2FA; o bloqueio por IP só expira sozinho); registra `BLOQUEIO_LOGIN_REMOVIDO`. Chamado pelo botão "Desbloquear" da tela Participantes. A listagem `GET /api/usuarios` (antiga tela Usuários) foi removida |
| `/api/usuarios/:id/2fa` | DELETE | ✅ | ❌ | ❌ | Reset do 2FA de quem perdeu o celular: apaga segredo e códigos de recuperação e encerra as sessões da pessoa; registra `MFA_RESETADO` com quem resetou |
| `/api/auth/aceitar-termos` | POST | ✅ | ✅ | ✅ | Registra o aceite da versão vigente dos Termos/Política para a própria conta do token |
| `/api/auth/2fa/configuracao` | POST | ✅ | ✅ | ✅ | Ativação opcional: gera o segredo e o QR code no servidor, sempre da própria conta do token; `409` se o 2FA já estiver ativo |
| `/api/auth/2fa/configuracao/confirmar` | POST | ✅ | ✅ | ✅ | Ativa com um código válido; devolve os 8 códigos de recuperação uma única vez; limite de 5 tentativas |
| `/api/auth/2fa/desativar` | POST | ✅ | ✅ | ✅ | Própria conta; exige senha + código atual; encerra as outras sessões e reemite a de quem desativou |
| `/api/eventos` | GET | ✅ | ✅ | ✅ | Questionário vem sem o campo `correta` para ALUNO (`eventoParaDTO(..., paraAluno)`); traz a contagem de inscritos (número agregado, sem identificar ninguém) |
| `/api/eventos/:id` | GET | ✅ | ✅ | ✅ | idem |
| `/api/eventos` | POST | ✅ | ✅ | ❌ | — |
| `/api/eventos/:id` | PUT | ✅ | ✅ | ❌ | — |
| `/api/eventos/:id` | DELETE | ✅ | ✅ | ❌ | Remove em cascata inscrições/feedbacks/tentativas do evento |
| `/api/eventos/:eventoId/inscricoes` | POST | ❌ | ❌ | ✅ | Autoinscrição — sempre usa o `participanteId` do token, nunca do corpo; conta inativa → `403` |
| `/api/eventos/:eventoId/questionario` | GET | ✅ | ✅ | ✅ | Perguntas sem gabarito pra qualquer perfil que peça por essa rota (é a rota que a tela do aluno usa) |
| `/api/eventos/:eventoId/questionario/respostas` | POST | ❌ | ❌ | ✅ | Corrige e salva a tentativa do próprio aluno; exige presença confirmada no evento e conta ativa (`403` senão); bloqueia se já aprovou ou esgotou as 2 tentativas |
| `/api/eventos/:eventoId/questionario/tentativas` | GET | ❌ | ❌ | ✅ | Só as tentativas do próprio aluno (usa `participanteId` do token) |
| `/api/salas` | GET | ✅ | ✅ | ✅ | — |
| `/api/salas/:id` | GET | ✅ | ✅ | ✅ | — |
| `/api/salas` | POST / `/api/salas/:id` | ✅ | ✅ | ❌ | PUT/DELETE — bloqueia exclusão se houver evento vinculado |
| `/api/palestrantes` | GET | ✅ (id/nome/e-mail) | ✅ (id/nome/e-mail) | ✅ (só id/nome) | Campo `email` some da resposta pra ALUNO — ele não precisa disso pra nada (minimização, guia 4.3), via `palestranteParaDTO(..., paraAluno)` |
| `/api/palestrantes/:id` | GET | ✅ | ✅ | ✅ (só id/nome) | idem |
| `/api/palestrantes` | POST / `/api/palestrantes/:id` | ✅ | ✅ | ❌ | PUT/DELETE |
| `/api/participantes` | GET | ✅ | ✅ | ❌ | Lista todo mundo, com a situação (ativo/inativo) e a da conta do aluno (`usuarioId`, `mfaAtivo`, `bloqueado`) — sem segredo do 2FA, códigos de recuperação nem hash de senha. Nenhum verbo desse módulo é liberado pro ALUNO, nem leitura do próprio registro (o aluno usa `/usuarios/me`) |
| `/api/dashboard` | GET | ✅ | ✅ | ❌ | Indicadores agregados da tela Dashboard (totais, próximos eventos com ocupação, presença por evento) — só números, título do evento e nome da sala, nenhum dado pessoal |
| `/api/participantes/alunos` | GET | ✅ | ✅ | ❌ | Só quem tem conta `ALUNO`, usado pela tela de Check-in |
| `/api/participantes/:id` | GET | ✅ | ✅ | ❌ | — |
| `/api/participantes/:id` | PUT | ✅ | ✅ | ❌ | Corrigir nome/e-mail/RGM (vale também para a conta de login do aluno). **Inativar** exige `motivoInativacao`, encerra as sessões do aluno e cancela as inscrições pendentes em eventos futuros; **reativar** apaga o motivo e libera o login. Só a equipe inativa e reativa; auditoria nos dois casos |
| `/api/participantes/:id` | DELETE | ✅ | ✅ | ❌ | Exclusão definitiva (a mudar na Fase 2 pra anonimização — ver `04-plano-de-retencao-e-descarte.md`); só funciona com o participante já inativo |
| `/api/inscricoes` | GET | ✅ | ✅ | ✅ (só as próprias) | `participanteId` da query é **ignorado** se quem pede for ALUNO — usa sempre o do token |
| `/api/inscricoes` | POST | ✅ | ✅ | ❌ | Inscrição manual (a autoinscrição do aluno é a rota de eventos acima); aluno inativo → `409 PARTICIPANTE_INATIVO` |
| `/api/eventos/:eventoId/checkin` | POST | ❌ | ❌ | ✅ (só a própria inscrição) | O aluno pede o check-in (participante do token), só dentro da janela e com a inscrição PENDENTE. A antiga marcação direta (`PUT /api/inscricoes/:id`) saiu |
| `/api/checkin/eventos`, `/api/checkin/eventos/:eventoId` | GET | ✅ | ✅ | ❌ | Eventos com a janela aberta e painel "Check-ins" (o professor: só os eventos dele, `403` nos outros) |
| `/api/checkin/inscricoes/:id/aprovar` e `/recusar`, `/api/checkin/eventos/:eventoId/aprovar-todos` | POST | ✅ | ✅ | ❌ | Decidem o pedido (ou revertem a decisão, dentro da janela); o professor só nos eventos dele (`403` nos outros); aprovar aluno inativo → `409 PARTICIPANTE_INATIVO` |
| `/api/inscricoes/:id` | DELETE | ✅ | ✅ | ❌ | — |
| `/api/inscricoes/:id/confirmacao-email` | POST | ✅ | ✅ | ✅ (só a própria) | Serviço confere `inscricao.participanteId === participanteIdDoToken`, senão `403` |
| `/api/feedbacks` | GET | ✅ (tudo) | ✅ (tudo) | ✅ (só os próprios) | `participanteId` da query é ignorado se quem pede for ALUNO |
| `/api/feedbacks/elegiveis` | GET | ❌ | ❌ | ✅ | Eventos com certificado e ainda sem feedback do próprio aluno |
| `/api/feedbacks/:id` | GET | ✅ | ✅ | ✅ (só o próprio) | `403` se não for da equipe e o feedback não for do próprio `participanteId` |
| `/api/feedbacks` | POST | ❌ (`403`) | ❌ (`403`) | ✅ | Só o aluno envia, em nome dele mesmo: `participanteId` do corpo é ignorado, sempre o do token; exige certificado no evento (`403` senão) e ainda não ter avaliado (`409` senão). A equipe não escreve feedback em nome de aluno |
| `/api/feedbacks/:id` | PUT | ❌ (`403`) | ❌ (`403`) | ❌ (`403`) | Ninguém edita feedback depois de enviado: o aluno corrige excluindo e enviando outro; a equipe não altera o conteúdo |
| `/api/feedbacks/:id` | DELETE | ✅ (com motivo) | ✅ (com motivo) | ✅ (só o próprio) | Aluno: só o próprio (`403` no de outra pessoa), sem motivo, e depois pode enviar outro pro mesmo evento. Equipe: qualquer um, com `motivo` obrigatório de uma lista fechada (`422` sem ele). Registra `FEEDBACK_EXCLUIDO` dizendo se foi o aluno ou a equipe, com o motivo |
| `/api/questionario-tentativas` | GET | ✅ | ✅ | ❌ | Todas as tentativas de todos os alunos, usada só pela tela de gestão de certificados — nunca vira ranking exposto a aluno |
| `/api/logs-auditoria` | GET | ✅ | ✅ | ❌ | Paginada, com filtros; só leitura |
| `/api/logs-auditoria/responsaveis` | GET | ✅ | ✅ | ❌ | Lista de quem já aparece na trilha, pro filtro |

## Observações estruturais

- **Nenhuma rota aceita `perfil` no corpo de uma edição de usuário** — hoje
  não existe nenhum endpoint de auto-edição de perfil (nem de dado). Isso
  muda na Fase 2 com a página "Meus dados": o novo endpoint de autoedição
  do aluno precisa continuar sem aceitar `perfil` nem `participanteId`
  alheio, do mesmo jeito que os endpoints de feedback/inscrição já fazem.
- **Negação por padrão:** toda rota fora de `/api/auth` tem `autenticar`
  explícito; não existe rota "esquecida" sem middleware — confirmado lendo
  `expressApp.ts` e todos os arquivos de rotas por completo.
- **2FA:** opcional para todos os perfis; cada pessoa ativa e desativa só o
  da própria conta.
- **Quem pode resetar o 2FA de outra pessoa:** só ADMINISTRADOR. O 2FA de
  aluno é resetado pelo botão "Resetar 2FA" da tela Participantes (a
  secretaria vê a coluna 2FA, mas não o botão, e a API recusa com `403`).
  Conta de administrador/secretaria não aparece em nenhuma tela: o reset é
  pelo script `backend/scripts/resetar-2fa.ts` — o mesmo usado em
  emergência, quando o único administrador perde o celular e os códigos de
  recuperação —, que só roda com as credenciais de produção e registra
  `MFA_RESETADO` na auditoria com a origem "script de emergência".
  SECRETARIA e ALUNO não resetam o 2FA de ninguém (`403`).
- **Quem inativa e reativa aluno:** só ADMINISTRADOR e SECRETARIA
  (`PUT /api/participantes/:id`); o aluno não altera a própria situação.
- **Feedback é do aluno:** só ele cria; ninguém edita; ele exclui o
  próprio; a equipe só exclui, com motivo.
- **Rotas de log/auditoria** não têm nenhum verbo de escrita (nem
  `PUT`/`PATCH`/`DELETE`) — a trilha é somente leitura por desenho.

## Perfil PROFESSOR (09/11/2026)

Conta criada pela administração ou pela secretaria (só nome e e-mail
`@umc.br`), ativada no primeiro acesso. A regra de quais eventos cada perfil
enxerga fica num lugar só (`backend/src/utils/escopo.ts`): equipe todos,
professor **só os que ele criou** (`eventos.criadoPorId`), aluno só os
**aprovados**. Evento de outro professor ou da equipe responde `404` para o
professor (ele não descobre que existe).

| Rota | Método | PROFESSOR | Regra |
|---|---|:---:|---|
| `/api/professores` (listar, criar), `/:id/reenviar-codigo`, `/:id/eventos-em-aberto`, `/:id/inativar` e `/:id/reativar` | GET/POST | ❌ | Só ADMINISTRADOR e SECRETARIA. Inativar exige motivo e, se houver evento em aberto, para quem transferir (professor ativo ou equipe) |
| `/api/dashboard` | GET | ✅ | Mesmo service; os números contam só os eventos dele, e só aprovados |
| `/api/eventos` e `/api/eventos/:id` | GET | ✅ | Só os dele, em qualquer situação |
| `/api/eventos?de=&ate=` (calendário) e `/api/eventos/busca` | GET | ✅ | Calendário: os dele completos; os dos outros (aprovados, pendentes e propostas pendentes) só como sala, início e fim — sem título, palestrante, inscritos nem id. Busca: só os dele, com limite |
| `/api/eventos` | POST | ✅ | Nasce `PENDENTE` (a equipe cria `APROVADO`); pode usar palestrante aprovado ou um dele ainda pendente; já reserva a sala |
| `/api/eventos/:id` | PUT/DELETE | ✅ | Só os dele. Evento encerrado: `409 EVENTO_ENCERRADO` para todos os perfis. Evento já aprovado: título, tema e questionário mudam na hora; sala, horário, carga horária e palestrante viram **proposta de alteração** (uma pendente por evento, só antes de o evento começar). Questionário com tentativa de aluno: `409 QUESTIONARIO_TRAVADO` para todos os perfis |
| `/api/eventos/:id/proposta` | PUT/DELETE | ✅ | Só o dono: corrige a proposta pendente, reenvia a recusada (resposta opcional) ou cancela |
| `/api/eventos/:id/proposta/aprovar` e `/recusar` | POST | ❌ | Só a equipe. Aprovar confere de novo sala, capacidade, conflito e palestrante aprovado, aplica e avisa os inscritos por e-mail; recusar exige motivo |
| `/api/eventos/:id/aprovar` e `/recusar` | POST | ❌ | Só a equipe. Recusa exige motivo (mín. 10 caracteres); aprovar confere a sala e se o palestrante já está aprovado |
| `/api/eventos/:id/reenviar` | POST | ✅ | Só o dono, só evento `RECUSADO`; volta para `PENDENTE` e confere a sala de novo |
| `/api/eventos/:id/historico` | GET | ✅ | Equipe e o professor dono |
| `/api/palestrantes` | GET | ✅ | Aprovados + os dele; e-mail e situação só dos dele |
| `/api/palestrantes` | POST | ✅ | Nasce `PENDENTE` |
| `/api/palestrantes/:id` | PUT | ✅ | Só os dele. Já aprovado: nome e e-mail viram proposta de alteração |
| `/api/palestrantes/:id/proposta` | PUT/DELETE | ✅ | Só o dono: corrige, reenvia ou cancela a proposta |
| `/api/palestrantes/:id/proposta/aprovar` e `/recusar` | POST | ❌ | Só a equipe |
| `/api/palestrantes/:id` | DELETE | ❌ | Só a equipe |
| `/api/palestrantes/:id/reenviar` e `/historico` | POST/GET | ✅ | Só os dele |
| `/api/inscricoes`, `/inscricoes/gestao`, `POST /inscricoes` e `DELETE /inscricoes/:id` | todos | ✅ | Só nos eventos dele (inscrição manual e cancelamento). Evento não aprovado não aceita inscrição |
| `/api/checkin/...` (lista, painel, aprovar, recusar, aprovar todos) | todos | ✅ | Só nos eventos dele: no evento de outro professor ou da equipe, `403` |
| `/api/participantes/alunos` | GET | ✅ | Busca para a inscrição manual, limitada a 20 resultados |
| `/api/participantes` (resto) | todos | ❌ | Inativar, remover, bloqueio e 2FA continuam só da equipe |
| `/api/certificados`, `/situacao`, `/emitir/:inscricaoId` | GET/POST | ✅ | Só nos eventos dele |
| `/api/questionario-tentativas` | GET | ✅ | Só as notas dos eventos dele |
| `/api/feedbacks` | GET | ✅ | Só as avaliações dos eventos dele, com o nome do aluno |
| `/api/feedbacks/:id` | DELETE | ❌ | O professor não exclui avaliação (`403`) |
| `/api/salas` | GET | ✅ | Só consulta (nome e capacidade, sem os números de ocupação da equipe) |
| `/api/salas` | POST/PUT/DELETE | ❌ | Só a equipe |
| `/api/logs-auditoria` | GET | ❌ | Só a equipe |
| `/api/meus-dados` | GET | ❌ | Só o aluno |
| `/api/aprovacoes/contadores` | GET | ✅ | Equipe recebe os pendentes; professor, os recusados dele (propostas incluídas) |

**Professor inativado:** o login responde `403` com a mesma mensagem do aluno
inativo, as sessões abertas caem e ele deixa de ser destino de transferência.
Os eventos em aberto (não encerrados, ou encerrados há menos de 24 horas)
passam antes para outro professor ativo ou para a equipe; os encerrados há
mais tempo continuam com o nome dele.

**Aluno e evento não aprovado:** evento `PENDENTE` ou `RECUSADO` não aparece
para o aluno em lugar nenhum (programação, detalhe, questionário, inscrição),
e palestrante não aprovado também não. A API recusa a inscrição com `404`.
