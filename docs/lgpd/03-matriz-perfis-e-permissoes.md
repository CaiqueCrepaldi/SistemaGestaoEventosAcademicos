# Matriz de perfis e permissões — SGEA

**Data:** 29/09/2026 · **Versão:** 3 (2FA opcional para todos os perfis,
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
| `/api/auth/recuperacao-senha/confirmar` | POST | Qualquer pessoa | Exige código válido, não vencido, dentro do limite de tentativas; encerra as sessões abertas da conta |

## Rota da etapa do 2FA (só com o token temporário)

| Rota | Método | Token aceito | Observação |
|---|---|---|---|
| `/api/auth/2fa/verificar` | POST | Só "2FA pendente" | Código do aplicativo ou código de recuperação; limite de 5 tentativas por conta; devolve a sessão |

## Rotas autenticadas

| Rota | Método | ADMINISTRADOR | SECRETARIA | ALUNO | Regra de propriedade |
|---|---|:---:|:---:|:---:|---|
| `/api/usuarios/me` | GET | ✅ | ✅ | ✅ | Sempre os dados do próprio token (`req.usuario.sub`) — não existe `GET /usuarios/:id` |
| `/api/usuarios` | GET | ✅ | ❌ | ❌ | Lista as contas para a tela Usuários: nome, e-mail, perfil, se o aluno está inativado, situação do 2FA e se está bloqueada por tentativas — sem RGM, sem segredo |
| `/api/usuarios/:id/bloqueio` | DELETE | ✅ | ❌ | ❌ | Remove o bloqueio por tentativas da conta (login, recuperação de senha e código do 2FA; o bloqueio por IP só expira sozinho); registra `BLOQUEIO_LOGIN_REMOVIDO` |
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
| `/api/participantes` | GET | ✅ | ✅ | ❌ | Lista todo mundo, com a situação (ativo/inativo) — nenhum verbo desse módulo é liberado pro ALUNO, nem leitura do próprio registro (o aluno usa `/usuarios/me`) |
| `/api/participantes/alunos` | GET | ✅ | ✅ | ❌ | Só quem tem conta `ALUNO`, usado pela tela de Check-in |
| `/api/participantes/:id` | GET | ✅ | ✅ | ❌ | — |
| `/api/participantes/:id` | PUT | ✅ | ✅ | ❌ | Corrigir nome/e-mail/RGM (vale também para a conta de login do aluno). **Inativar** exige `motivoInativacao`, encerra as sessões do aluno e cancela as inscrições pendentes em eventos futuros; **reativar** apaga o motivo e libera o login. Só a equipe inativa e reativa; auditoria nos dois casos |
| `/api/participantes/:id` | DELETE | ✅ | ✅ | ❌ | Exclusão definitiva (a mudar na Fase 2 pra anonimização — ver `04-plano-de-retencao-e-descarte.md`); só funciona com o participante já inativo |
| `/api/inscricoes` | GET | ✅ | ✅ | ✅ (só as próprias) | `participanteId` da query é **ignorado** se quem pede for ALUNO — usa sempre o do token |
| `/api/inscricoes` | POST | ✅ | ✅ | ❌ | Inscrição manual (a autoinscrição do aluno é a rota de eventos acima); aluno inativo → `409 PARTICIPANTE_INATIVO` |
| `/api/inscricoes/:id` | PUT | ✅ | ✅ | ❌ | Confirmar presença/ausência (check-in); bloqueia presença de aluno inativo (`409 PARTICIPANTE_INATIVO`) |
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
- **Quem pode resetar o 2FA de outra pessoa:** só ADMINISTRADOR, pela tela
  Usuários (a tela não oferece o botão para a própria conta). Em
  emergência — o único administrador perdeu o celular e os códigos de
  recuperação — quem tem as credenciais de produção roda
  `backend/scripts/resetar-2fa.ts`, que registra `MFA_RESETADO` na
  auditoria com a origem "script de emergência". SECRETARIA e ALUNO não
  resetam o 2FA de ninguém (`403`).
- **Quem inativa e reativa aluno:** só ADMINISTRADOR e SECRETARIA
  (`PUT /api/participantes/:id`); o aluno não altera a própria situação.
- **Feedback é do aluno:** só ele cria; ninguém edita; ele exclui o
  próprio; a equipe só exclui, com motivo.
- **Rotas de log/auditoria** não têm nenhum verbo de escrita (nem
  `PUT`/`PATCH`/`DELETE`) — a trilha é somente leitura por desenho.
