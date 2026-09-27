# Matriz de perfis e permissões — SGEA

**Data:** 27/09/2026 · **Versão:** 1

Gerada diretamente das rotas reais do backend (`backend/src/modules/*/*.routes.ts`
e `backend/src/middleware/auth.ts`), não de uma descrição informal do
sistema. Toda rota autenticada exige `Authorization: Bearer <token>`
(middleware `autenticar`); "ADMINISTRADOR"/"SECRETARIA" nas colunas
significa que o middleware `autorizar(...)` barra qualquer outro perfil com
`403 ACESSO_NEGADO` antes de a rota executar.

## Rotas públicas (sem autenticação)

| Rota | Método | Quem acessa | Observação |
|---|---|---|---|
| `/api/auth/registro` | POST | Qualquer pessoa | Cria `Participante` + `Usuario` (perfil `ALUNO`); exige `aceiteLgpd: true` |
| `/api/auth/login` | POST | Qualquer pessoa | Devolve o JWT |
| `/api/auth/recuperacao-senha` | POST | Qualquer pessoa | Não revela se o e-mail existe (mesma resposta em ambos os casos) |
| `/api/auth/recuperacao-senha/confirmar` | POST | Qualquer pessoa | Exige código válido, não vencido, dentro do limite de tentativas |

## Rotas autenticadas

| Rota | Método | ADMINISTRADOR | SECRETARIA | ALUNO | Regra de propriedade |
|---|---|:---:|:---:|:---:|---|
| `/api/usuarios/me` | GET | ✅ | ✅ | ✅ | Sempre os dados do próprio token (`req.usuario.sub`) — não existe `/usuarios/:id` |
| `/api/eventos` | GET | ✅ | ✅ | ✅ | Questionário vem sem o campo `correta` para ALUNO (`eventoParaDTO(..., paraAluno)`) |
| `/api/eventos/:id` | GET | ✅ | ✅ | ✅ | idem |
| `/api/eventos` | POST | ✅ | ✅ | ❌ | — |
| `/api/eventos/:id` | PUT | ✅ | ✅ | ❌ | — |
| `/api/eventos/:id` | DELETE | ✅ | ✅ | ❌ | Remove em cascata inscrições/feedbacks/tentativas do evento |
| `/api/eventos/:eventoId/inscricoes` | POST | ❌ | ❌ | ✅ | Autoinscrição — sempre usa o `participanteId` do token, nunca do corpo |
| `/api/eventos/:eventoId/questionario` | GET | ✅ | ✅ | ✅ | Perguntas sem gabarito pra qualquer perfil que peça por essa rota (é a rota que a tela do aluno usa) |
| `/api/eventos/:eventoId/questionario/respostas` | POST | ❌ | ❌ | ✅ | Corrige e salva a tentativa do próprio aluno; bloqueia se já aprovou ou esgotou as 2 tentativas |
| `/api/eventos/:eventoId/questionario/tentativas` | GET | ❌ | ❌ | ✅ | Só as tentativas do próprio aluno (usa `participanteId` do token) |
| `/api/salas` | GET | ✅ | ✅ | ✅ | — |
| `/api/salas/:id` | GET | ✅ | ✅ | ✅ | — |
| `/api/salas` | POST / `/api/salas/:id` | ✅ | ✅ | ❌ | PUT/DELETE — bloqueia exclusão se houver evento vinculado |
| `/api/palestrantes` | GET | ✅ (id/nome/e-mail) | ✅ (id/nome/e-mail) | ✅ (só id/nome) | Campo `telefone` foi **removido do sistema** (bloco 1); campo `email` some da resposta pra ALUNO — ele não precisa disso pra nada (minimização, guia 4.3), via `palestranteParaDTO(..., paraAluno)` |
| `/api/palestrantes/:id` | GET | ✅ | ✅ | ✅ (só id/nome) | idem |
| `/api/palestrantes` | POST / `/api/palestrantes/:id` | ✅ | ✅ | ❌ | PUT/DELETE |
| `/api/participantes` | GET | ✅ | ✅ | ❌ | Lista todo mundo — nenhum verbo desse módulo é liberado pro ALUNO, nem leitura do próprio registro (o aluno usa `/usuarios/me`) |
| `/api/participantes/alunos` | GET | ✅ | ✅ | ❌ | Só quem tem conta `ALUNO`, usado pela tela de Check-in |
| `/api/participantes/:id` | GET | ✅ | ✅ | ❌ | — |
| `/api/participantes/:id` | PUT | ✅ | ✅ | ❌ | Inativar exige `motivoInativacao` |
| `/api/participantes/:id` | DELETE | ✅ | ✅ | ❌ | Hoje é hard delete (a mudar na Fase 2 pra anonimização — ver `04-plano-de-retencao-e-descarte.md`); só funciona com o participante já inativo |
| `/api/inscricoes` | GET | ✅ | ✅ | ✅ (só as próprias) | `participanteId` da query é **ignorado** se quem pede for ALUNO — usa sempre o do token |
| `/api/inscricoes` | POST | ✅ | ✅ | ❌ | Inscrição manual (a autoinscrição do aluno é a rota de eventos acima) |
| `/api/inscricoes/:id` | PUT | ✅ | ✅ | ❌ | Confirmar presença/ausência (check-in); bloqueia presença de aluno inativo (`409 PARTICIPANTE_INATIVO`) |
| `/api/inscricoes/:id` | DELETE | ✅ | ✅ | ❌ | — |
| `/api/inscricoes/:id/confirmacao-email` | POST | ✅ | ✅ | ✅ (só a própria) | Serviço confere `inscricao.participanteId === participanteIdDoToken`, senão `403` |
| `/api/feedbacks` | GET | ✅ (tudo) | ✅ (tudo) | ✅ (só os próprios) | `participanteId` da query é ignorado se quem pede for ALUNO |
| `/api/feedbacks/elegiveis` | GET | ❌ | ❌ | ✅ | Eventos com certificado e ainda sem feedback do próprio aluno |
| `/api/feedbacks/:id` | GET | ✅ | ✅ | ✅ (só o próprio) | `403` se não for da equipe e o feedback não for do próprio `participanteId` |
| `/api/feedbacks` | POST | ✅ | ✅ | ✅ | ALUNO: `participanteId` do corpo é **ignorado**, sempre o do token; exige ter certificado no evento (`403` senão) e ainda não ter avaliado (`409` senão) |
| `/api/feedbacks/:id` | PUT | ✅ | ✅ | ✅ (só o próprio) | Mesma checagem de posse do GET |
| `/api/feedbacks/:id` | DELETE | ✅ | ✅ | ❌ | Checagem manual de perfil dentro da rota (não usa `autorizar`, mas o efeito é o mesmo) |
| `/api/questionario-tentativas` | GET | ✅ | ✅ | ❌ | Todas as tentativas de todos os alunos, usada só pela tela de gestão de certificados — nunca vira ranking exposto a aluno |
| `/api/logs-auditoria` | GET | ✅ | ✅ | ❌ | Paginada, com filtros; só leitura |
| `/api/logs-auditoria/responsaveis` | GET | ✅ | ✅ | ❌ | Lista de quem já aparece na trilha, pro filtro |

## Observações estruturais

- **Nenhuma rota aceita `perfil` no corpo de uma edição de usuário** — hoje
  não existe nenhum endpoint de auto-edição de perfil (nem de dado). Isso
  muda na Fase 2 com a página "Meus dados": o novo endpoint de autoedição
  do aluno precisa continuar sem aceitar `perfil` nem `participanteId`
  alheio, do mesmo jeito que os endpoints de feedback/inscrição já fazem.
- **Negação por padrão:** toda rota tem `autenticar` explícito; não existe
  rota "esquecida" sem middleware — confirmado lendo `expressApp.ts` e os
  nove arquivos de rotas por completo.
- **Rotas de log/auditoria** não têm nenhum verbo de escrita (nem
  `PUT`/`PATCH`/`DELETE`) — a trilha é somente leitura por desenho.
