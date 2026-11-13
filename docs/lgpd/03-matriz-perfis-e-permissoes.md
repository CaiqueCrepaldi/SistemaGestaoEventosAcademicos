# Matriz de perfis e permissões — SGEA

**Data:** 12/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Gerada a partir das rotas reais do backend (`backend/src/modules/*/*.routes.ts`,
`backend/src/middleware/auth.ts` e `backend/src/utils/escopo.ts`). Toda rota
autenticada exige `Authorization: Bearer <token>` (middleware `autenticar`),
que recusa com `401` o token vencido, o token temporário da etapa do 2FA
(fora da rota dele) e a sessão invalidada depois de emitida (versão do
token). O middleware `autorizar(...)` barra o perfil não listado com `403
ACESSO_NEGADO` antes de a rota executar.

**Regra única de visibilidade (`utils/escopo.ts`):** a equipe
(ADMINISTRADOR e SECRETARIA) vê todos os eventos; o PROFESSOR vê só os que
ele criou (`eventos.criadoPorId`); o ALUNO vê só os aprovados. Evento de
outro professor ou da equipe responde `404` ao professor (ele não descobre
que existe), com três exceções descritas abaixo: o calendário, em que ele vê
só a ocupação da sala; as rotas do check-in, que respondem `403`; e as de
inscrição, que respondem `403 EVENTO_DE_OUTRO_PROFESSOR` com a mensagem
(desde 12/11/2026 o professor só inscreve, cancela e lista inscrições nos
eventos dele).

**Desde 12/11/2026 o professor não acessa certificados nem avaliações**
(`403` mesmo nos eventos dele; as abas saem do menu). A validação pública
do certificado continua aberta.

## Rotas públicas (sem autenticação)

| Rota | Método | Observação |
|---|---|---|
| `/api/auth/registro` | POST | Passo 1 do cadastro do aluno: valida tudo, exige `aceiteLgpd: true` e guarda o cadastro pendente por 15 minutos; manda o código ao e-mail. Nenhuma conta é criada aqui |
| `/api/auth/registro/confirmar` | POST | Passo 2: confere o código (5 tentativas) e cria a conta com o aceite e a versão dos Termos |
| `/api/auth/registro/reenviar-codigo` | POST | Novo código (60 s entre envios; limite por e-mail e por IP) |
| `/api/auth/login` | POST | Sem 2FA: devolve a sessão. Com 2FA ativo: só o token temporário "2FA pendente" (5 min). Conta inativa (aluno ou professor): `403 CONTA_INATIVA`, sem o motivo. Professor que ainda não usou o convite: o mesmo `401` genérico de senha errada. Limite por conta e por IP |
| `/api/auth/recuperacao-senha` | POST | Resposta sempre igual, exista ou não a conta; conta de professor que ainda espera o convite é tratada como inexistente. Limite por conta e por IP |
| `/api/auth/recuperacao-senha/confirmar` | POST | Exige código válido, não vencido, dentro do limite de tentativas; encerra as sessões abertas da conta. Mesma resposta para e-mail sem conta e para conta que espera o convite |
| `/api/auth/primeiro-acesso/convite` | POST | Consulta a chave do convite do professor: devolve só o e-mail da conta, sem gastar o convite. Chave inexistente, vencida ou usada: o mesmo `422 CONVITE_INVALIDO`; chave errada conta no limite por IP |
| `/api/auth/primeiro-acesso` | POST | Ativa a conta de professor: chave do convite (24 horas, uso único), senha nova e `aceiteLgpd: true` |
| `/api/certificados/validar/:codigo` | GET | Validação pública: só nome, evento, data, carga horária e emissão (nunca RGM, e-mail ou ids); 30 consultas por IP |

## Rota da etapa do 2FA (só com o token temporário)

| Rota | Método | Observação |
|---|---|---|
| `/api/auth/2fa/verificar` | POST | Código do aplicativo ou código de recuperação; limite de 5 tentativas por conta; devolve a sessão |

## Rotas autenticadas

Legenda: ✅ permitido · ❌ `403` · "só os dele" = só nos eventos que o
professor criou · "só o próprio" = sempre o participante do token, nunca um
id vindo da tela.

| Rota | Método | ADMIN | SECRETARIA | PROFESSOR | ALUNO | Regra |
|---|---|:---:|:---:|:---:|:---:|---|
| `/api/usuarios/me` | GET | ✅ | ✅ | ✅ | ✅ | Sempre a própria conta (não existe `GET /usuarios/:id`) |
| `/api/usuarios/:id/bloqueio` | DELETE | ✅ | ❌ | ❌ | ❌ | Remove o bloqueio por tentativas da conta; auditoria `BLOQUEIO_LOGIN_REMOVIDO` |
| `/api/usuarios/:id/2fa` | DELETE | ✅ | ❌ | ❌ | ❌ | Reset do 2FA de quem perdeu o celular; encerra as sessões; auditoria `MFA_RESETADO` |
| `/api/auth/aceitar-termos` | POST | ✅ | ✅ | ✅ | ✅ | Aceite da versão vigente para a própria conta |
| `/api/auth/2fa/configuracao`, `/configuracao/confirmar`, `/desativar` | POST | ✅ | ✅ | ✅ | ✅ | Sempre a própria conta; desativar exige senha e código |
| `/api/auth/alterar-senha` | POST | ✅ | ✅ | ✅ | ✅ | Sempre a própria conta (a do token). Exige a senha atual e, com 2FA ativo, o código; erros contam no limite da conta; encerra as outras sessões; auditoria `SENHA_ALTERADA` |
| `/api/eventos` | GET | ✅ | ✅ | só os dele | só aprovados | Para o aluno, o questionário vem sem o gabarito |
| `/api/eventos?de=&ate=` (calendário) | GET | ✅ | ✅ | ✅ | — | Equipe: tudo completo. Professor: os dele completos; os dos outros que ocupam sala (aprovados, pendentes e propostas pendentes) só como sala, início e fim — sem título, palestrante, inscritos nem id. O aluno recebe a programação de sempre |
| `/api/eventos/busca` | GET | ✅ | ✅ | só os dele | ❌ | Título, tema, palestrante ou sala, com limite (máx. 50) |
| `/api/eventos/:id` | GET | ✅ | ✅ | só os dele | só aprovados | `404` fora do escopo |
| `/api/eventos` | POST | ✅ | ✅ | ✅ | ❌ | Da equipe nasce aprovado; do professor, pendente (já reserva a sala) |
| `/api/eventos/:id` | PUT | ✅ | ✅ | só os dele | ❌ | Evento encerrado: `409`. Professor em evento aprovado: sala, horário, carga e palestrante viram proposta de alteração. Questionário com tentativa de aluno: `409 QUESTIONARIO_TRAVADO` |
| `/api/eventos/:id` | DELETE | ✅ | ✅ | só os dele | ❌ | Só evento sem inscrição e não encerrado |
| `/api/eventos/:id/aprovar`, `/recusar` | POST | ✅ | ✅ | ❌ | ❌ | Recusa exige motivo |
| `/api/eventos/:id/cancelar` | POST | ✅ | ✅ | ❌ | ❌ | Desde 13/11/2026. Só evento APROVADO, ainda não iniciado e não cancelado; motivo de 10 a 500 caracteres (`422` fora disso). Já iniciado: `409 EVENTO_JA_INICIADO`; pendente ou recusado: `409 EVENTO_NAO_APROVADO`; já cancelado: `409 EVENTO_CANCELADO`. Não se desfaz. Encerra a proposta pendente como recusada, libera a sala, mantém as inscrições e avisa por e-mail os inscritos e o professor responsável; auditoria `EVENTO_CANCELADO` sem o motivo. O professor recebe `403`, mesmo no próprio evento |
| `/api/eventos/:id/reenviar` | POST | ✅ | ✅ | só os dele | ❌ | Evento recusado volta a pendente |
| `/api/eventos/:id/historico` | GET | ✅ | ✅ | só os dele | ❌ | Histórico da aprovação |
| `/api/eventos/:id/proposta` | PUT | ❌ | ❌ | só os dele | ❌ | Corrige a proposta pendente ou reenvia a recusada |
| `/api/eventos/:id/proposta` | DELETE | ✅ | ✅ | só os dele | ❌ | Cancela a proposta |
| `/api/eventos/:id/proposta/aprovar`, `/recusar` | POST | ✅ | ✅ | ❌ | ❌ | Aprovar confere de novo sala, capacidade, conflito e palestrante, aplica e avisa os inscritos por e-mail |
| `/api/eventos/:eventoId/inscricoes` | POST/DELETE | ❌ | ❌ | ❌ | só o próprio | Autoinscrição e cancelamento (antes do início e sem pedido de check-in) |
| `/api/eventos/:eventoId/checkin` | POST | ❌ | ❌ | ❌ | só o próprio | Pedido de check-in, de 1 hora antes do início até 24 horas depois do fim |
| `/api/eventos/:eventoId/questionario` | GET | ✅ | ✅ | só os dele | só aprovados | Perguntas sem gabarito |
| `/api/eventos/:eventoId/questionario/respostas` | POST | ❌ | ❌ | ❌ | só o próprio | Exige check-in aprovado e conta ativa; no máximo 2 tentativas |
| `/api/eventos/:eventoId/questionario/tentativas` | GET | ❌ | ❌ | ❌ | só o próprio | — |
| `/api/checkin/eventos`, `/eventos/:eventoId` | GET | ✅ | ✅ | só os dele (`403` nos outros) | ❌ | Eventos com o check-in aberto e painel com nome, RGM e horário de cada pedido. Se o aluno já avaliou o evento (`avaliou`): só para a equipe |
| `/api/checkin/inscricoes/:id/aprovar`, `/recusar`, `/eventos/:eventoId/aprovar-todos` | POST | ✅ | ✅ | só os dele (`403` nos outros) | ❌ | Grava quem decidiu e quando; revisão dentro do prazo até o aluno responder o questionário |
| `/api/salas` e `/api/salas/:id` | GET | ✅ | ✅ | ✅ | ✅ | Os números de ocupação só para a equipe |
| `/api/salas` | POST/PUT/DELETE | ✅ | ✅ | ❌ | ❌ | Não exclui sala com evento |
| `/api/palestrantes` e `/:id` | GET | ✅ | ✅ | aprovados + os dele | só aprovados | E-mail só para a equipe e para o professor que cadastrou |
| `/api/palestrantes` | POST | ✅ | ✅ | ✅ | ❌ | Do professor nasce pendente |
| `/api/palestrantes/:id` | PUT | ✅ | ✅ | só os dele | ❌ | Professor em palestrante aprovado: nome e e-mail viram proposta |
| `/api/palestrantes/:id/proposta` | PUT/DELETE | ❌ | ❌ | só os dele | ❌ | — |
| `/api/palestrantes/:id/reenviar` | POST | ❌ | ❌ | só os dele | ❌ | — |
| `/api/palestrantes/:id/historico` | GET | ✅ | ✅ | só os dele | ❌ | — |
| `/api/palestrantes/:id/aprovar`, `/recusar`, `/proposta/aprovar`, `/proposta/recusar` | POST | ✅ | ✅ | ❌ | ❌ | — |
| `/api/palestrantes/:id` | DELETE | ✅ | ✅ | ❌ | ❌ | Só palestrante já decidido (aprovado ou recusado): aguardando aprovação → `409 PALESTRANTE_PENDENTE` ("Aprove ou recuse este palestrante antes de excluir."); com proposta de alteração aguardando → `409 PROPOSTA_PENDENTE`; com evento → `409 CONFLITO_DEPENDENCIA` |
| `/api/participantes/alunos` | GET | ✅ | ✅ | ✅ | ❌ | Busca de aluno para a inscrição manual, no máximo 20 resultados |
| `/api/participantes`, `/:id` | GET | ✅ | ✅ | ❌ | ❌ | Lista com a situação da conta (ativa, 2FA, bloqueio), sem segredo nem hash |
| `/api/participantes/:id` | PUT | ✅ | ✅ | ❌ | ❌ | Corrige nome e RGM (o e-mail não muda: `422`); inativar exige motivo, encerra as sessões e cancela as inscrições sem pedido de check-in em eventos futuros; reativar apaga o motivo |
| `/api/participantes/:id` | DELETE | ✅ | ✅ | ❌ | ❌ | Só aluno já inativo e sem certificado (`409 PARTICIPANTE_COM_CERTIFICADO`) |
| `/api/equipe` (também em `/api/professores`), `/:id/reenviar-convite`, `/:id/eventos-em-aberto`, `/:id/inativar`, `/:id/reativar`, `/:id` (DELETE) | GET/POST/DELETE | ✅ professores e secretarias | só professores | ❌ | ❌ | Tela Equipe. Criar conta de secretaria: só ADMINISTRADOR (`403 SO_ADMINISTRADOR`). E-mail de qualquer conta (de qualquer perfil) ou de cadastro em andamento, em qualquer combinação de maiúsculas: `409 EMAIL_DUPLICADO` ("Já existe uma conta com este e-mail."). Ninguém mexe na própria conta (`403 PROPRIA_CONTA`); conta de administrador não aparece e não é criada, inativada nem excluída (`403`, ou `409 ULTIMO_ADMINISTRADOR` se for o único ativo). Inativar exige motivo e, havendo evento em aberto do professor, para quem transferir. Excluir: só conta inativa ou com convite pendente; com histórico, fica inativa |
| `/api/inscricoes` | GET | ✅ | ✅ | só os dele | só o próprio | O `participanteId` da consulta é ignorado para o aluno. Professor com `?eventoId=` de outro evento: `403` |
| `/api/inscricoes/gestao` | GET | ✅ | ✅ | só os dele | ❌ | Paginada e filtrada no servidor. Professor com `?eventoId=` de outro evento: `403` |
| `/api/inscricoes` | POST | ✅ | ✅ | só os dele | ❌ | Inscrição manual; a equipe em qualquer evento. Professor em evento de outro: `403 EVENTO_DE_OUTRO_PROFESSOR` ("Você só pode inscrever alunos nos seus próprios eventos."); aluno inativo: `409`; aluno já inscrito noutro evento no mesmo horário: `409 CONFLITO_DE_HORARIO` (vale para todos) |
| `/api/inscricoes/:id` | DELETE | ✅ | ✅ | só os dele | ❌ | Mesma regra do cancelamento pelo aluno; o aluno é avisado por e-mail. Professor em evento de outro: `403` ("Você só pode cancelar inscrições dos seus próprios eventos.") |
| `/api/questionario-tentativas` | GET | ✅ | ✅ | só os dele | ❌ | Notas para a gestão; nunca vira ranking para aluno. Nenhuma tela do professor usa esta rota desde 12/11/2026 |
| `/api/certificados` | GET | ✅ | ✅ | ❌ | só o próprio | O professor não vê certificados (desde 12/11/2026) |
| `/api/certificados/situacao` | GET | ✅ | ✅ | ❌ | ❌ | — |
| `/api/certificados/emitir/:inscricaoId` | POST | ✅ | ✅ | ❌ | só o próprio | Exige check-in aprovado e 60% no questionário |
| `/api/feedbacks` | GET | ✅ | ✅ | ❌ | só o próprio | O professor não vê avaliações (desde 12/11/2026) |
| `/api/feedbacks/:id` | GET | ✅ | ✅ | ❌ | só o próprio | — |
| `/api/feedbacks/elegiveis` | GET | ❌ | ❌ | ❌ | só o próprio | Eventos com presença confirmada (`PRESENTE`) e ainda sem avaliação |
| `/api/feedbacks` | POST | ❌ | ❌ | ❌ | só o próprio | Exige presença confirmada (`PRESENTE`), com ou sem questionário (`403 PRESENCA_NAO_CONFIRMADA`); uma avaliação por evento |
| `/api/feedbacks/:id` | PUT | ❌ | ❌ | ❌ | ❌ | Ninguém edita avaliação |
| `/api/feedbacks/:id` | DELETE | ✅ (com motivo) | ✅ (com motivo) | ❌ | só o próprio | Equipe: motivo de lista fechada; auditoria `FEEDBACK_EXCLUIDO` |
| `/api/dashboard` | GET | ✅ | ✅ | só os dele | ❌ | Só números agregados, título do evento e nome da sala. Professor: só os eventos dele, sem `certificadosLiberados`, `mediaFeedback` e `totalFeedbacks` |
| `/api/aprovacoes/contadores` | GET | ✅ | ✅ | ✅ | ❌ | Equipe: pendentes; professor: os recusados dele e `recusas`, um id por recusa em aberto (o aviso que ele fecha no X volta só com recusa nova) |
| `/api/logs-auditoria`, `/responsaveis` | GET | ✅ | ❌ | ❌ | ❌ | Só leitura, paginada. Só o administrador (desde 12/11/2026); a aba Auditoria nem aparece para a secretaria |
| `/api/meus-dados` | GET | ❌ | ❌ | ❌ | só o próprio | Tudo o que o sistema guarda sobre o aluno, sem cache |

## Observações

- **Negação por padrão:** toda rota fora das públicas acima tem `autenticar`
  explícito; a trilha de auditoria não tem nenhuma rota de escrita.
- **Ninguém define o próprio perfil:** o cadastro público só cria aluno e
  nenhuma rota muda o perfil de uma conta. A tela Equipe cria só professor e
  secretaria (esta, só pelo administrador); conta de administrador não é
  criada por tela.
- **2FA:** opcional para todos; cada pessoa ativa e desativa só o da própria
  conta. Só o ADMINISTRADOR reseta o 2FA de outra pessoa (aluno, pela tela
  Participantes); conta da equipe, pelo script `backend/scripts/resetar-2fa.ts`,
  que registra `MFA_RESETADO` com a origem "script de emergência".
- **Inativação:** aluno, pela tela Participantes; professor e secretaria,
  pela tela Equipe (professor com a transferência dos eventos em aberto; a
  secretaria não é responsável por evento, então nada é transferido). A
  conta inativa recebe no login a mesma resposta do aluno inativo, as
  sessões caem e o professor inativo deixa de ser destino de transferência.
- **Exclusão de conta da equipe:** só conta inativa ou com convite pendente.
  Com histórico (eventos ou palestrantes criados, decisões de aprovação,
  propostas, check-ins decididos, pedidos de titular atendidos), a conta
  fica inativa com a mensagem "Esta conta tem histórico no sistema e fica
  preservada como inativa." Os registros de auditoria nunca são apagados.
- **Evento cancelado:** fica no histórico e nada mais acontece nele, para
  ninguém: inscrição (pelo aluno ou manual), cancelamento de inscrição,
  pedido e decisão de check-in, questionário, certificado, avaliação, edição
  e exclusão respondem `409 EVENTO_CANCELADO` ("Este evento foi
  cancelado."). Não entra no Dashboard nem na tela Check-in, não segura a
  sala nem o horário do aluno e, para o professor, não aparece como "Sala
  ocupada". Todos os perfis que veem o evento veem que foi cancelado e o
  motivo; quem cancelou, só a equipe e o professor.
- **Aluno e evento não aprovado:** evento pendente ou recusado não aparece
  para o aluno em lugar nenhum, e palestrante não aprovado também não.
- **E-mail único:** o e-mail de login identifica uma única conta em todo o
  sistema, de qualquer perfil, e não pode ser o de um cadastro de aluno em
  andamento. Toda entrada passa por `normalizarEmail` (sem espaços e em
  minúsculas) e o e-mail é gravado assim. O do palestrante é único só entre
  palestrantes, também em minúsculas. `backend/scripts/verificar-emails-duplicados.ts`
  (só leitura, `--producao` opcional) confere os dados já gravados sem
  mostrar nenhum e-mail.
- **Contas fictícias da carga de demonstração:** o campo `usuarios.ficticio`
  não aparece em nenhuma tela nem resposta da API; ele só faz o sistema não
  enviar e-mail para essas contas.
