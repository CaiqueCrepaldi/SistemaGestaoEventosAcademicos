# Verificação de requisitos — SGEA

**Data:** 29/09/2026 · **Versão:** 1

Lista dos requisitos do sistema, como cada um foi testado, o resultado e o
que precisou ser corrigido. Os requisitos vêm de
`docs/funcionalidades-principais.md` e `docs/api-contract.md` (não havia
lista anexada), mais as melhorias pedidas pelo orientador nesta rodada
(itens B a G: hash de senha, inativação, feedback, campos obrigatórios, 2FA
opcional e dados pessoais sem criptografia).

## Como foi testado

Todos os testes rodaram em 29/09/2026 contra o banco de desenvolvimento
(`SGEA_dev`), nunca contra a produção — cada script se recusa a rodar se o
`DATABASE_URL` não for o do dev. Cada um cria os próprios dados de teste e
apaga no final (os registros de auditoria ficam, como em qualquer operação).

| Teste | O que faz | Comando | Resultado |
|---|---|---|---|
| Requisitos pela API | Sobe o backend numa porta local e faz as chamadas HTTP de verdade, requisito por requisito | `cd backend && npx tsx scripts/testar-requisitos.ts` | **127/127** verificações (03/11/2026, banco `SGEA_dev_migracao`) |
| 2FA pela API | Ativação, login em duas etapas, reuso de código, bloqueio, recuperação, reset, desativação | `cd backend && npx tsx scripts/testar-2fa.ts` | **55/55** (03/11/2026, banco `SGEA_dev_migracao`) |
| Interface | Navegador de verdade (Google Chrome, sem janela) usando as telas no frontend local ligado ao backend local | ver `frontend/testes-interface/testar-interface.mjs` (passo a passo no topo do arquivo) | **60/60** |
| Hash de senha | Mostra o formato do hash bcrypt gravado no banco de dev e prova que a mesma senha gera hashes diferentes | `cd backend && npx tsx scripts/demonstrar-hash-senha.ts` | ver `docs/lgpd/07` |
| Conversão dos dados pessoais | Simulação, aplicação e segunda aplicação (idempotência) no dev | `cd backend && npx tsx scripts/converter-dados-pessoais.ts [--aplicar]` (o script saiu do código em 03/11/2026, junto com as colunas que ele convertia; está no histórico do git, commit `8c2e7df`) | 3 usuários, 3 participantes e 98 logs convertidos; a 2ª rodada não achou nada |

Na coluna "Teste", **API Rxx** é a seção de mesmo código em
`testar-requisitos.ts` e **Interface** é a seção de mesmo nome em
`testar-interface.mjs`.

> **Atualização de 03/11/2026:** a tela Usuários saiu (2FA e bloqueio foram
> para Participantes), o Dashboard ganhou endpoint próprio, os Palestrantes
> do aluno viraram cards e nome/e-mail/RGM deixaram de ser duplicados entre
> `usuarios` e `participantes` (migration `20261103150000`). As suítes de API
> rodaram de novo num banco separado, `SGEA_dev_migracao` (todas as
> migrations antigas + dados cifrados no formato antigo + conversão pela rota
> temporária + a migration nova): **requisitos 127/127** e **2FA 55/55**,
> além de 11/11 da rota de conversão e 12/12 do código novo sobre os dados
> migrados. A suíte de **Interface não rodou de novo** (precisa do Google
> Chrome, que não estava na máquina): o item marcado "A rodar" fica pendente
> até essa execução; a contagem de Interface da tabela acima é da rodada anterior.

> **Atualização de 04/11/2026:** entraram o certificado registrado com
> validação pública (RF018, RF019, RF027), o conflito de sala (RF024), o
> cancelamento de inscrição (RF025), a trava da presença depois do
> questionário (RF015), a ocupação média das salas no Dashboard (RF021) e o
> bloqueio da exclusão de evento com inscrições (RF009/RNF010, que substitui
> a exclusão em cascata do item 22). A migration
> `20261104120000_certificados` só cria a tabela `certificados`. As suítes
> ganharam as seções novas — API **R26** a **R29**, **R19** refeita e uma
> verificação nova no **R25**; Interface: 7 indicadores no Dashboard, código
> do certificado na tela e página pública de validação — mas **ainda não
> rodaram**: precisam do banco `SGEA_dev` com a migration nova aplicada (e
> do Google Chrome, no caso da Interface). Por isso os itens novos estão
> como "A rodar" e as contagens da tabela acima continuam as da rodada de
> 03/11/2026. Nesta data rodaram só a verificação de tipos
> (`npm run typecheck` no backend e `npx tsc --noEmit` no frontend, sem
> erros), um teste isolado do formato do código de validação e uma
> conferência das rotas novas sem banco (as autenticadas respondem 401 sem
> token; a de validação não pede token).

## Requisitos

| # | Requisito | Como foi testado | Resultado | O que foi corrigido |
|---|---|---|---|---|
| 1 | Cadastro público de aluno: nome só com letras, RGM de 11 dígitos, e-mail `@alunos.umc.br`, senha com 8+ caracteres, aceite dos Termos obrigatório, sem e-mail/RGM duplicado | API R01; Interface "Cadastro de aluno" | OK | Formulário passou a marcar cada campo com o problema (item E). Texto do aceite reescrito: "Li e aceito os Termos de Uso e estou ciente da Política de Privacidade" (não é consentimento). E-mail/RGM duplicado agora aparece embaixo do campo certo |
| 2 | Login com mensagem genérica (não revela se o e-mail existe) e limite de tentativas | API R02; testes do bloco 2 | OK | — |
| 3 | Dados da própria conta (`GET /usuarios/me`) | API R03 | OK | — |
| 4 | Permissões por perfil: aluno barrado em rota da equipe; sem token → 401 | API R04 | OK | — |
| 5 | Salas: cadastro, edição, leitura pelo aluno, exclusão bloqueada com evento vinculado | API R05 e R07; Interface "Salas" | OK | Campos obrigatórios (item E) |
| 6 | Palestrantes: nome só letras, e-mail válido e único, aluno não recebe o e-mail, exclusão bloqueada com evento vinculado | API R06 e R07; Interface "Palestrantes" | OK | E-mail duplicado (erro do backend) agora aparece embaixo do campo e-mail (item E) |
| 7 | Eventos com questionário de 10 perguntas × 4 alternativas × 1 correta, gabarito escondido do aluno | API R07; Interface "Eventos" | OK | Erro de cada pergunta aparece na própria pergunta (item E). **Corrigido:** excluir um evento pela tela apagava antes, uma por uma pela API, as inscrições e os feedbacks do evento — o backend já faz isso em cascata numa operação só; agora a tela faz uma chamada. (Desde 04/11/2026 evento com inscrição não é mais excluído — ver item 22) |
| 8 | Autoinscrição do aluno (sempre o participante do token, sem duplicidade, sem passar da capacidade) | API R08; Interface "Agenda e certificados" | OK | Aluno inativo também barrado no próprio serviço (item C) |
| 9 | Inscrição manual pela equipe | API R09; Interface "Inscrição manual" | OK | Bloqueia aluno inativo (item C); campos obrigatórios (item E) |
| 10 | Aluno só vê as próprias inscrições, mesmo forjando o parâmetro na URL | API R10 | OK | — |
| 11 | E-mail de confirmação da inscrição, só pelo dono | API R11 | OK | — |
| 12 | Check-in (presente/ausente) pela equipe; quem confirmou vem do token | API R12; Interface "Check-in pela tela da secretaria" | OK | — |
| 13 | Questionário obrigatório: correção no servidor, no máximo 2 tentativas, aprovado não refaz | API R13; Interface "Questionário" | OK após correção | **Corrigido:** o aluno conseguia responder o questionário de um evento sem ter presença confirmada (nem precisava estar inscrito). Agora o backend exige presença confirmada e conta ativa (403 caso contrário). Pergunta sem resposta fica destacada (item E) |
| 14 | Certificado liberado com presença + 60% no questionário, emitido em PDF pelo aluno | Interface "Agenda e certificados" (inclui o download do PDF); desde 04/11/2026 também API R29 | OK após correção (rodada anterior); emissão pela API a rodar | **Corrigido:** a tela de Certificados do aluno nunca mostrava certificado nenhum. Ela buscava a lista de participantes, que só a equipe pode ler (403), e a tela ficava vazia sem aviso. Agora usa os dados da própria conta do aluno. Em 04/11/2026 a emissão passou para a API (item 31) |
| 15 | Agenda com inscritos/capacidade de cada evento | API R09 (contagem); Interface "Agenda e certificados" | OK após correção | **Corrigido:** para o aluno a Agenda mostrava 0 ou 1 inscrito (contava só as inscrições dele, as únicas que ele enxerga). A API passou a devolver a contagem de inscritos por evento |
| 16 | Feedback só de palestra com certificado, um por evento, sempre em nome do próprio aluno | API R14 | OK | — |
| 17 | Feedback não é editado; aluno exclui o próprio e pode enviar outro; equipe só exclui, com motivo (item D) | API R22; Interface "Feedback do aluno" e "Feedback pela equipe" | OK | Implementado nesta rodada |
| 18 | Participantes: listagem e correção de nome/e-mail/RGM pela equipe | API R15 | OK após correção | **Corrigido:** corrigir o nome ou o e-mail do participante não atualizava a conta de login do aluno — ele continuava entrando com o e-mail antigo e o nome antigo aparecia no topo da tela e na auditoria. Agora a correção vale para os dois. E-mail gravado sempre em minúsculo |
| 19 | Inativação e reativação padronizadas (item C) | API R16; Interface "Inativação", "Inscrição manual" e "Participantes: 2FA e acesso" | OK (API R16 rodada de novo em 03/11/2026; a conferência do selo "Inativo" na tela passou para Participantes — Interface a rodar) | Implementado nesta rodada (ver `docs/lgpd/03` e `07`) |
| 20 | Recuperação de senha por código | API R17; Interface "Esqueci a senha" | OK | Campos obrigatórios (item E) |
| 21 | Trilha de auditoria: filtros, responsáveis, nada de dado pessoal no detalhe | API R18; Interface "Auditoria: filtro pelas ações novas" | OK após correção | **Corrigido:** a tela de Auditoria não conhecia as ações criadas nos blocos de segurança (2FA, bloqueio por tentativas etc.): elas não apareciam no filtro e a tabela mostrava só o código |
| 22 | Exclusão de evento **bloqueada** quando há qualquer inscrição (RF009/RNF010): `409 EVENTO_COM_INSCRICOES` ("Cancele as inscrições antes de excluir o evento."), nada é apagado em cascata; evento sem inscrição é excluído normalmente | API R19 (refeita em 04/11/2026); a tela Eventos avisa sem abrir a confirmação quando o evento tem inscritos | A rodar | **Alterado em 04/11/2026:** antes a exclusão levava junto inscrições, feedbacks e tentativas de questionário (o R19 antigo conferia essa cascata) |
| 23 | Dashboard da equipe: 7 indicadores (desde 04/11/2026, com a ocupação média das salas — item 36), próximos eventos com ocupação e gráfico de presença por evento, tudo de `GET /api/dashboard` (só equipe, sem dado pessoal) | API R04 (aluno → 403) e R25; Interface "Equipe entra só com a senha" (7 indicadores, gráfico e menu "Dashboard") | OK na API (R04, R25, 03/11/2026); Interface a rodar | Refeito em 03/11/2026: antes eram 4 indicadores calculados no navegador; o item de menu "Principal" passou a se chamar "Dashboard" |
| 24 | 2FA opcional para todos os perfis (item F) | `testar-2fa.ts`; API R20; Interface "Equipe entra só com a senha" e "2FA na Minha conta" | OK | Implementado nesta rodada |
| 25 | Senha com bcrypt, salt por senha, custo 12 e rehash no login (item B) | API R20; `demonstrar-hash-senha.ts` | OK | Implementado nesta rodada |
| 26 | Nome, e-mail e RGM em texto puro, sem quebrar os registros antigos (item G, primeira implantação) | API R24; conversão no dev + as três suítes rodadas de novo depois dela | OK; segunda implantação (cada dado numa tabela só, migration `20261103150000`) testada em `SGEA_dev_migracao` com R24, aguardando a conversão em produção | Implementado nesta rodada; a conversão em produção depende de confirmação |
| 27 | Campos obrigatórios marcados e validados do mesmo jeito em todos os formulários (item E) | Interface (todas as seções "E") | OK | Implementado nesta rodada |
| 28 | Comentário de feedback longo | Leitura dos dois bancos (schema × dev × produção) | Corrigido | **Corrigido:** o schema dizia `VARCHAR(191)` e o banco de dev seguia isso (comentário com mais de 191 caracteres dava erro 500), enquanto a produção já tinha `TEXT`. Schema e dev alinhados com a produção por migration, com limite de 1000 caracteres e mensagem clara |
| 29 | Participantes mostra 2FA e acesso (bloqueio) do aluno; resetar 2FA e desbloquear só pelo administrador, também no backend | `testar-2fa.ts` (secretaria vê as colunas e leva 403 nas ações; admin desbloqueia e a coluna volta a "Liberado"; `GET /usuarios` → 404); API R16; Interface "Inativação" e "Participantes: 2FA e acesso" | OK na API (`testar-2fa.ts` 55/55, R16, 03/11/2026); Interface a rodar | Implementado em 03/11/2026, no lugar da tela Usuários |
| 30 | Palestrantes do aluno em cards (iniciais, nome, próximas palestras), sem e-mail | Interface "Agenda e certificados do aluno" | A rodar | Implementado em 03/11/2026 |
| 31 | Certificado registrado (RF018/RF019): `POST /api/certificados/emitir/{inscricaoId}` só emite com presença `PRESENTE` e uma tentativa com ≥ 60%; grava na primeira emissão (código aleatório de 12 caracteres, `crypto.randomBytes`, e cópia dos dados impressos) e devolve o mesmo registro nas seguintes; aluno só a própria inscrição, equipe qualquer uma que cumpra os requisitos; `GET /api/certificados?eventoId=` (equipe todos, aluno os dele); auditoria `CERTIFICADO_EMITIDO` | API R29; Interface "Agenda e certificados do aluno" (código na tela e botão "Baixar certificado" depois de emitir) | A rodar | Implementado em 04/11/2026 (migration `20261104120000_certificados`). Antes o código impresso era calculado no navegador a partir do id da inscrição e não podia ser conferido; o PDF agora é montado só com os dados que a API devolve |
| 32 | Validação pública do certificado (RF027): página `/validar-certificado` sem login (link na tela de login; endereço e link impressos no PDF); `GET /api/certificados/validar/{codigo}` devolve só nome, evento, data, carga horária e emissão (sem RGM nem e-mail); `404` "Certificado não encontrado"; limite de 30 consultas por IP (`429`) | API R29; Interface "Agenda e certificados do aluno" (código válido e inexistente) | A rodar | Implementado em 04/11/2026 |
| 33 | Conflito de sala (RF024): o intervalo `[horário, horário + carga horária)` não pode cruzar outro evento da mesma sala (`409 CONFLITO_DE_SALA` citando o outro evento); terminar exatamente quando o outro começa não é conflito; a edição ignora o próprio evento; a mensagem aparece no campo Data/Horário do formulário | API R26 | A rodar | Implementado em 04/11/2026 |
| 34 | Cancelamento de inscrição (RF025): o aluno cancela a própria (`DELETE /api/eventos/{eventoId}/inscricoes`, botão "Cancelar inscrição" com confirmação na tela Eventos) e a equipe cancela pelo `DELETE /api/inscricoes/{id}`, com a mesma regra (presença pendente e evento que ainda não começou, senão `409`); e-mail de aviso ao aluno quando é a equipe (falha de envio não desfaz o cancelamento); auditoria `INSCRICAO_CANCELADA`; o aluno pode se inscrever de novo se houver vaga | API R27 | A rodar | Implementado em 04/11/2026 |
| 35 | Presença travada depois do questionário (RF015): com qualquer tentativa do aluno no evento, mudar a presença ou excluir/cancelar a inscrição responde `409` "A presença não pode mais ser alterada: o aluno já respondeu o questionário."; a tela de Check-in desabilita os botões | API R28 | A rodar | Implementado em 04/11/2026 |
| 36 | Dashboard: ocupação média das salas (RF021) — média, entre os eventos, de inscritos / capacidade da sala, em % | API R25 (compara com o cálculo direto no banco); Interface "Equipe entra só com a senha" | A rodar | Implementado em 04/11/2026 (novo cartão "Ocupação média das salas") |
| 37 | Deploy só pela Vercel | Conferência do `frontend/package.json` e do `package-lock.json` | OK | Removidos o script `deploy` (gh-pages) e a dependência `gh-pages` (`npm uninstall`, que tirou só ela e as dependências exclusivas dela do lock) |

## Outras correções encontradas na verificação

- `docs/api-contract.md` e `docs/funcionalidades-principais.md` descreviam
  comportamentos antigos (formato do evento sem o questionário, domínio de
  e-mail de outra instituição, participantes sem tela de gestão, avisos só
  por notificação). Os dois foram atualizados.
- O tamanho de `motivoInativacao` no schema dizia 191 caracteres, mas a
  coluna sempre teve 500 (corrigido só no schema, sem migration).
- Os scripts `backfill-criptografia.ts` e `backfill-auditoria.ts` (migrações
  de dado de uso único, já rodadas) foram removidos: o primeiro voltaria a
  cifrar nome/e-mail/RGM, contrariando a decisão do item G.

## Pendências registradas (fora desta rodada)

- Página "Meus dados", anonimização da conta, rotina automática de retenção
  e publicação da Política/Termos v2 no site continuam pendentes (blocos 4 a
  7 da Fase 2) — o formulário de "Meus dados" ainda não existe, então não
  entrou na padronização do item E.
- `POST /auth/recuperacao-senha` responde 404 quando o e-mail não está
  cadastrado (limitação registrada em `docs/lgpd/07`, decisão pendente).
- Rodar `testar-requisitos.ts` e `testar-interface.mjs` no `SGEA_dev` com a
  migration `20261104120000_certificados` aplicada (itens 14, 22, 23 e 31 a
  36 estão "A rodar").
- Documentos de LGPD (`docs/lgpd/01` inventário, `02` matriz e `04`
  retenção) ainda não citam a tabela `certificados`, que guarda cópia de
  nome e RGM do aluno junto com o certificado emitido. A remoção de um aluno
  com certificado emitido agora é recusada (`409
  PARTICIPANTE_COM_CERTIFICADO`); o tratamento disso no pedido de exclusão
  do titular fica para a etapa de "Meus dados" (RF026).
