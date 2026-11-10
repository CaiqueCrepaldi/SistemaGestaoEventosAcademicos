# Verificação de requisitos — SGEA

**Data:** 09/11/2026 · **Versão:** 3 (check-in pedido pelo aluno, item 45; a
versão 2, de 06/11/2026, e a versão 1, de 29/09/2026, receberam as
atualizações registradas abaixo)

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
| Requisitos pela API | Sobe o backend numa porta local e faz as chamadas HTTP de verdade, requisito por requisito | `cd backend && npx tsx scripts/testar-requisitos.ts` | **460/460** verificações (09/11/2026, banco `SGEA_dev`, com as contas fictícias sem e-mail) |
| 2FA pela API | Ativação, login em duas etapas, reuso de código, bloqueio, recuperação, reset, desativação | `cd backend && npx tsx scripts/testar-2fa.ts` | **55/55** (09/11/2026, banco `SGEA_dev`) |
| Interface | Navegador de verdade (Google Chrome, sem janela) usando as telas no frontend local ligado ao backend local | ver `frontend/testes-interface/testar-interface.mjs` (passo a passo no topo do arquivo) | **157/157** (09/11/2026, no Microsoft Edge — ver a atualização de 04/11) |
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
> Chrome, que não estava na máquina). Ela rodou em 04/11/2026 (ver abaixo).

> **Atualização de 04/11/2026:** entraram o certificado registrado com
> validação pública (RF018, RF019, RF027), o conflito de sala (RF024), o
> cancelamento de inscrição (RF025), a trava da presença depois do
> questionário (RF015), a ocupação média das salas no Dashboard (RF021) e o
> bloqueio da exclusão de evento com inscrições (RF009/RNF010, que substitui
> a exclusão em cascata do item 22). A migration
> `20261104120000_certificados` só cria a tabela `certificados`. As suítes
> ganharam as seções novas — API **R26** a **R29**, **R19** refeita e uma
> verificação nova no **R25**; Interface: 7 indicadores no Dashboard, código
> do certificado na tela e página pública de validação. Também rodaram a
> verificação de tipos (`npm run typecheck` no backend e `npx tsc --noEmit`
> no frontend, sem erros) e um teste isolado do formato do código de
> validação.
>
> As três suítes rodaram no `SGEA_dev` com as migrations `20261103150000` e
> `20261104120000` aplicadas: **requisitos 165/165**, **2FA 55/55** e
> **Interface 69/69** (contagens já com a correção da autoinscrição em
> evento que já começou — item 8). A Interface rodou no Microsoft Edge (mesmo motor
> Chromium), porque o Google Chrome não está instalado na máquina: o script
> foi executado com `channel: "msedge"` no lugar de `"chrome"`, sem outra
> mudança. Antes disso, o `SGEA_dev` precisou ser alinhado ao repositório:
> ele tinha uma migration aplicada fora do repo
> (`20261002150000_certificados_e_presenca_travada`, com outra tabela
> `certificados` e a exclusão de evento com inscrições recusada pelo
> banco). Os efeitos dela foram desfeitos, com a tabela antiga guardada como
> `certificados_antiga_bkp_20261104`. Duas contas de equipe criadas no dev
> em 02/10/2026, com nome e e-mail ainda cifrados por outra chave, foram
> copiadas para `usuarios_cifrados_bkp_20261104` antes da migration de
> 03/11, que põe o e-mail em minúsculas.

> **Atualização de 04/11/2026 (RF026):** entrou a versão enxuta dos
> direitos do titular (item 38): a página "Meus dados" mostra tudo o que o
> sistema guarda sobre o aluno, e os demais pedidos (cópia dos dados,
> correção, anonimização/exclusão, revisão humana do questionário,
> oposição) vão para `privacidade@sgeacademicos.com.br`, com resposta em
> até 15 dias. Sem mudança no banco. A primeira versão do dia também
> exportava os dados em JSON, tinha um bloco "Outros pedidos" com botão de
> e-mail e um link "Pedir revisão do resultado" na tela Certificados; os
> três saíram no mesmo dia, junto com a janela "Informações do usuário"
> (aberta ao clicar no nome, no topo da tela). Regra mantida: o aluno tem 2
> tentativas no questionário e, sem 60% em nenhuma, não recebe o
> certificado. Testes novos: API **R30** e Interface "Meus dados do aluno e
> reprovação no questionário (RF026)". As suítes rodaram de novo no
> `SGEA_dev`: **requisitos 183/183** e **Interface 83/83** (no Microsoft
> Edge). Essas
> contagens já incluem as verificações das mudanças anteriores do mesmo dia
> que ainda não estão descritas nas tabelas deste documento: janela do
> check-in (abre 1 hora antes do início), Agenda unida à tela Eventos,
> e-mail de confirmação da inscrição enviado pelo backend e limite de login
> por IP maior que o limite por conta.

> **Atualização de 06/11/2026:** entraram a confirmação do e-mail no
> cadastro por código de 6 dígitos (item 39), a regra da senha nova com a
> lista de requisitos na tela (item 40), o e-mail do aluno não editável
> (item 41), a confirmação ao clicar em "Sair" (item 42) e os Termos de Uso
> e a Política de Privacidade na versão 3 (item 43). A migration
> `20261106120000_cadastros_pendentes` só cria a tabela
> `cadastros_pendentes`. As suítes ganharam as seções novas — API **R32**
> (código, reenvio, validade e limites) e **R33** (regra da senha), **R01**,
> **R15** e **R17** refeitos; Interface "Sair pede confirmação", "Regras da
> senha com checklist", "Cadastro: confirmação do e-mail por código", o
> e-mail só para leitura em Participantes e a lista de requisitos em
> "Esqueci a senha". As três suítes rodaram no `SGEA_dev` com a migration
> aplicada: **requisitos 231/231**, **2FA 55/55** e **Interface 110/110**
> (no Microsoft Edge). As contagens também cobrem as mudanças de 05/11/2026:
> "Esqueci a senha" com resposta genérica e as listas da equipe (Check-in,
> Inscrições e Certificados) buscadas e paginadas no servidor (API **R31**).

> **Atualização de 06/11/2026 (entrega de 09/11):** entrou o indicador de
> aprendizagem no Dashboard (RF021, item 44): cartão "Aprovação no
> questionário" e gráfico "Aprendizagem por evento", com os 8 cartões em 2
> linhas de 4. Sem mudança no banco. Testes novos: API **R25** ampliado e
> Interface "Dashboard: indicador de aprendizagem (RF021)". As suítes
> rodaram de novo no `SGEA_dev`: **requisitos 239/239** e **Interface
> 116/116** (no Microsoft Edge). Na mesma entrega, os documentos LGPD `01`,
> `02` e `04` passaram a descrever a tabela `certificados`, e o `02` e o
> `08` a exclusão a pedido como acontece hoje (ver "Pendências").

> **Atualização de 09/11/2026:** a ocupação das salas passou a medir o uso
> real (item 36): presentes ÷ capacidade, só nos eventos encerrados, no
> Dashboard e, por sala, na tela Salas (colunas "Eventos realizados" e
> "Ocupação média"), com a mesma função no backend. Sem mudança no banco.
> Teste novo: API **R34**, e o R25 passou a comparar com a regra nova. A
> suíte de requisitos rodou no `SGEA_dev`: **247/247**; 2FA **55/55**.

> **Atualização de 09/11/2026 (etapa 4, check-in pedido pelo aluno):** a
> equipe e o professor não marcam mais presença direto (o antigo
> `PUT /api/inscricoes/{id}` saiu). O aluno pede o check-in
> (`POST /api/eventos/{eventoId}/checkin`) e o professor do evento, a
> secretaria ou o administrador aprova ou recusa (`/api/checkin`), com
> janela de 1 hora antes do início até 24 horas depois do fim e expiração
> automática ao ler os dados (item 45). Migration
> `20261109210000_checkin_pedido_pelo_aluno` (só acrescenta dois valores ao
> enum da presença e uma coluna). Testes: API **R12** refeito, **R13**,
> **R16**, **R25**, **R27**, **R28** e **R38** ajustados e **R43** novo;
> Interface "Check-in: o aluno pede, a equipe aprova". As três suítes rodaram
> no `SGEA_dev` com a migration aplicada: **requisitos 424/424**, **2FA
> 55/55** e **Interface 135/135** (no Microsoft Edge).

> **Atualização de 09/11/2026 (etapa 5, calendário):** a tela Eventos da
> equipe e do professor virou um calendário do mês (item 46), sem mudança no
> banco. Testes: API **R44** novo e Interface "Calendário de eventos (equipe e
> professor)"; a seção da proposta de alteração passou a achar os eventos
> pela busca. As três suítes rodaram no `SGEA_dev`: **requisitos 443/443**,
> **2FA 55/55** e **Interface 149/149** (no Microsoft Edge, com a tela
> também conferida em largura de celular, sem rolagem lateral).

> **Atualização de 09/11/2026 (convite do professor por link):** o professor
> não digita mais código de 6 dígitos nem acha "Primeiro acesso" na tela de
> login: ativa a conta só pelo link do convite que recebe por e-mail (item
> 47). Variável nova `APP_URL` (endereço do frontend). Sem mudança no banco
> (o hash da chave fica na coluna `codigoHash` que já existia). Testes: API
> **R35** refeito; Interface "Proposta de alteração..." passou a ativar o
> professor pela tela do convite, e o login confere que não tem o link. As
> três suítes rodaram no `SGEA_dev`: **requisitos 454/454**, **2FA 55/55** e
> **Interface 157/157** (no Microsoft Edge).

> **Atualização de 09/11/2026 (preparação da apresentação):** LGPD reescrita
> como versão 1 (`VERSAO_TERMOS_ATUAL` = "1"), com os Termos de Uso, a
> Política de Privacidade e os documentos 00 a 10 de `docs/lgpd` conferidos
> contra o código atual; contas fictícias que nunca recebem e-mail (migration
> `20261109230000_conta_ficticia`, item 48); seed só com as três contas de
> demonstração (sem aluno de demonstração) e a carga de demonstração
> `backend/scripts/carga-demonstracao.ts` (item 49). Testes: API **R45**
> novo; as três suítes rodaram no `SGEA_dev` antes da carga: **requisitos
> 460/460**, **2FA 55/55** e **Interface 157/157** (no Microsoft Edge).

## Requisitos

| # | Requisito | Como foi testado | Resultado | O que foi corrigido |
|---|---|---|---|---|
| 1 | Cadastro público de aluno: nome só com letras, RGM de 11 dígitos, e-mail `@alunos.umc.br`, senha na regra da senha nova (item 40), aceite dos Termos obrigatório, sem e-mail/RGM duplicado; desde 06/11/2026 a conta só é criada depois da confirmação do e-mail (item 39) | API R01; Interface "Cadastro de aluno" | OK (06/11/2026) | Formulário passou a marcar cada campo com o problema (item E). Texto do aceite reescrito: "Li e aceito os Termos de Uso e estou ciente da Política de Privacidade" (não é consentimento). E-mail/RGM duplicado agora aparece embaixo do campo certo |
| 2 | Login com mensagem genérica (não revela se o e-mail existe) e limite de tentativas | API R02; testes do bloco 2 | OK | — |
| 3 | Dados da própria conta (`GET /usuarios/me`) | API R03 | OK | — |
| 4 | Permissões por perfil: aluno barrado em rota da equipe; sem token → 401 | API R04 | OK | — |
| 5 | Salas: cadastro, edição, leitura pelo aluno, exclusão bloqueada com evento vinculado | API R05 e R07; Interface "Salas" | OK | Campos obrigatórios (item E) |
| 6 | Palestrantes: nome só letras, e-mail válido e único, aluno não recebe o e-mail, exclusão bloqueada com evento vinculado | API R06 e R07; Interface "Palestrantes" | OK | E-mail duplicado (erro do backend) agora aparece embaixo do campo e-mail (item E) |
| 7 | Eventos com questionário de 10 perguntas × 4 alternativas × 1 correta, gabarito escondido do aluno | API R07; Interface "Eventos" | OK | Erro de cada pergunta aparece na própria pergunta (item E). **Corrigido:** excluir um evento pela tela apagava antes, uma por uma pela API, as inscrições e os feedbacks do evento — o backend já faz isso em cascata numa operação só; agora a tela faz uma chamada. (Desde 04/11/2026 evento com inscrição não é mais excluído — ver item 22) |
| 8 | Autoinscrição do aluno (sempre o participante do token, sem duplicidade, sem passar da capacidade, só em evento que ainda não começou) | API R08; Interface "Agenda e certificados" | OK após correção (04/11/2026) | Aluno inativo também barrado no próprio serviço (item C). **Corrigido em 04/11/2026:** o aluno conseguia se inscrever em evento que já tinha acontecido (a tela mostrava "Inscrever-se" e a API aceitava). Agora a API responde `409 EVENTO_JA_INICIADO` e a tela mostra o botão desabilitado "Encerrado". A inscrição manual da secretaria continua aceitando evento passado, para registro retroativo (API R27) |
| 9 | Inscrição manual pela equipe | API R09; Interface "Inscrição manual" | OK | Bloqueia aluno inativo (item C); campos obrigatórios (item E) |
| 10 | Aluno só vê as próprias inscrições, mesmo forjando o parâmetro na URL | API R10 | OK | — |
| 11 | E-mail de confirmação da inscrição, só pelo dono | API R11 | OK | — |
| 12 | Check-in pedido pelo aluno e aprovado pelo professor do evento ou pela equipe (desde 09/11/2026, item 45); quem decidiu e quando vêm do token e do relógio do servidor | API R12 e R43; Interface "Check-in: o aluno pede, a equipe aprova" | OK (09/11/2026) | Até 09/11/2026 a equipe marcava presente/ausente direto pela tela Check-in |
| 13 | Questionário obrigatório: correção no servidor, no máximo 2 tentativas, aprovado não refaz | API R13; Interface "Questionário" | OK após correção | **Corrigido:** o aluno conseguia responder o questionário de um evento sem ter presença confirmada (nem precisava estar inscrito). Agora o backend exige presença confirmada e conta ativa (403 caso contrário). Pergunta sem resposta fica destacada (item E) |
| 14 | Certificado liberado com presença + 60% no questionário, emitido em PDF pelo aluno | Interface "Agenda e certificados" (inclui o download do PDF); desde 04/11/2026 também API R29 | OK após correção; emissão pela API OK (R29 e Interface, 04/11/2026) | **Corrigido:** a tela de Certificados do aluno nunca mostrava certificado nenhum. Ela buscava a lista de participantes, que só a equipe pode ler (403), e a tela ficava vazia sem aviso. Agora usa os dados da própria conta do aluno. Em 04/11/2026 a emissão passou para a API (item 31) |
| 15 | Agenda com inscritos/capacidade de cada evento | API R09 (contagem); Interface "Agenda e certificados" | OK após correção | **Corrigido:** para o aluno a Agenda mostrava 0 ou 1 inscrito (contava só as inscrições dele, as únicas que ele enxerga). A API passou a devolver a contagem de inscritos por evento |
| 16 | Feedback só de palestra com certificado, um por evento, sempre em nome do próprio aluno | API R14 | OK | — |
| 17 | Feedback não é editado; aluno exclui o próprio e pode enviar outro; equipe só exclui, com motivo (item D) | API R22; Interface "Feedback do aluno" e "Feedback pela equipe" | OK | Implementado nesta rodada |
| 18 | Participantes: listagem e correção de nome e RGM pela equipe (o e-mail deixou de ser editável em 06/11/2026 — item 41) | API R15 | OK (06/11/2026) | **Corrigido (29/09/2026):** corrigir o nome do participante não atualizava a conta de login do aluno — o nome antigo aparecia no topo da tela e na auditoria. Agora a correção vale para a conta |
| 19 | Inativação e reativação padronizadas (item C) | API R16; Interface "Inativação", "Inscrição manual" e "Participantes: 2FA e acesso" | OK (API R16 e Interface, 04/11/2026; a conferência do selo "Inativo" na tela passou para Participantes) | Implementado nesta rodada (ver `docs/lgpd/03` e `07`) |
| 20 | Recuperação de senha por código, com a mesma resposta para e-mail com e sem conta (desde 05/11/2026) e a nova senha na regra da senha nova (item 40) | API R17; Interface "Esqueci a senha" | OK (06/11/2026) | Campos obrigatórios (item E). **Alterado em 05/11/2026:** antes respondia `404` para e-mail sem conta, revelando quem tinha cadastro |
| 21 | Trilha de auditoria: filtros, responsáveis, nada de dado pessoal no detalhe | API R18; Interface "Auditoria: filtro pelas ações novas" | OK após correção | **Corrigido:** a tela de Auditoria não conhecia as ações criadas nos blocos de segurança (2FA, bloqueio por tentativas etc.): elas não apareciam no filtro e a tabela mostrava só o código |
| 22 | Exclusão de evento **bloqueada** quando há qualquer inscrição (RF009/RNF010): `409 EVENTO_COM_INSCRICOES` ("Cancele as inscrições antes de excluir o evento."), nada é apagado em cascata; evento sem inscrição é excluído normalmente | API R19 (refeita em 04/11/2026); a tela Eventos avisa sem abrir a confirmação quando o evento tem inscritos | OK (API R19, 04/11/2026) | **Alterado em 04/11/2026:** antes a exclusão levava junto inscrições, feedbacks e tentativas de questionário (o R19 antigo conferia essa cascata) |
| 23 | Dashboard da equipe: 8 indicadores (desde 04/11/2026 com a ocupação média das salas — item 36 — e desde 06/11/2026 com a aprovação no questionário — item 44), próximos eventos com ocupação e gráficos de presença e de aprendizagem por evento, tudo de `GET /api/dashboard` (só equipe, sem dado pessoal) | API R04 (aluno → 403) e R25; Interface "Equipe entra só com a senha" (8 indicadores, os dois gráficos e menu "Dashboard") | OK (API R04 e R25; Interface com os 8 indicadores, 06/11/2026) | Refeito em 03/11/2026: antes eram 4 indicadores calculados no navegador; o item de menu "Principal" passou a se chamar "Dashboard" |
| 24 | 2FA opcional para todos os perfis (item F) | `testar-2fa.ts`; API R20; Interface "Equipe entra só com a senha" e "2FA na Minha conta" | OK | Implementado nesta rodada |
| 25 | Senha com bcrypt, salt por senha, custo 12 e rehash no login (item B) | API R20; `demonstrar-hash-senha.ts` | OK | Implementado nesta rodada |
| 26 | Nome, e-mail e RGM em texto puro, sem quebrar os registros antigos (item G, primeira implantação) | API R24; conversão no dev + as três suítes rodadas de novo depois dela | OK; segunda implantação (cada dado numa tabela só, migration `20261103150000`) testada em `SGEA_dev_migracao` com R24, aguardando a conversão em produção | Implementado nesta rodada; a conversão em produção depende de confirmação |
| 27 | Campos obrigatórios marcados e validados do mesmo jeito em todos os formulários (item E) | Interface (todas as seções "E") | OK | Implementado nesta rodada |
| 28 | Comentário de feedback longo | Leitura dos dois bancos (schema × dev × produção) | Corrigido | **Corrigido:** o schema dizia `VARCHAR(191)` e o banco de dev seguia isso (comentário com mais de 191 caracteres dava erro 500), enquanto a produção já tinha `TEXT`. Schema e dev alinhados com a produção por migration, com limite de 1000 caracteres e mensagem clara |
| 29 | Participantes mostra 2FA e acesso (bloqueio) do aluno; resetar 2FA e desbloquear só pelo administrador, também no backend | `testar-2fa.ts` (secretaria vê as colunas e leva 403 nas ações; admin desbloqueia e a coluna volta a "Liberado"; `GET /usuarios` → 404); API R16; Interface "Inativação" e "Participantes: 2FA e acesso" | OK (`testar-2fa.ts` 55/55, API R16 e Interface, 04/11/2026) | Implementado em 03/11/2026, no lugar da tela Usuários |
| 30 | Palestrantes do aluno em cards (iniciais, nome, próximas palestras), sem e-mail | Interface "Agenda e certificados do aluno" | OK (04/11/2026) | Implementado em 03/11/2026 |
| 31 | Certificado registrado (RF018/RF019): `POST /api/certificados/emitir/{inscricaoId}` só emite com presença `PRESENTE` e uma tentativa com ≥ 60%; grava na primeira emissão (código aleatório de 12 caracteres, `crypto.randomBytes`, e cópia dos dados impressos) e devolve o mesmo registro nas seguintes; aluno só a própria inscrição, equipe qualquer uma que cumpra os requisitos; `GET /api/certificados?eventoId=` (equipe todos, aluno os dele); auditoria `CERTIFICADO_EMITIDO` | API R29; Interface "Agenda e certificados do aluno" (código na tela e botão "Baixar certificado" depois de emitir) | OK (04/11/2026) | Implementado em 04/11/2026 (migration `20261104120000_certificados`). Antes o código impresso era calculado no navegador a partir do id da inscrição e não podia ser conferido; o PDF agora é montado só com os dados que a API devolve |
| 32 | Validação pública do certificado (RF027): cartão "Validar certificado" na tela Certificados (todos os perfis) e página `/validar-certificado` sem login, aberta pelo endereço/link impresso no PDF (sem link na tela de login desde 05/11/2026); `GET /api/certificados/validar/{codigo}` devolve só nome, evento, data, carga horária e emissão (sem RGM nem e-mail); `404` "Certificado não encontrado"; limite de 30 consultas por IP (`429`) | API R29; Interface "Agenda e certificados do aluno" (validação na tela Certificados, link do PDF sem login, código inexistente), "E / Login" (sem o link) e "Auditoria" (equipe valida na tela Certificados) | OK (05/11/2026) | Implementado em 04/11/2026; em 05/11/2026 a validação saiu da tela de login e foi para a tela Certificados |
| 33 | Conflito de sala (RF024): o intervalo `[horário, horário + carga horária)` não pode cruzar outro evento da mesma sala (`409 CONFLITO_DE_SALA` citando o outro evento); terminar exatamente quando o outro começa não é conflito; a edição ignora o próprio evento; a mensagem aparece no campo Data/Horário do formulário | API R26 | OK (04/11/2026) | Implementado em 04/11/2026 |
| 34 | Cancelamento de inscrição (RF025): o aluno cancela a própria (`DELETE /api/eventos/{eventoId}/inscricoes`, botão "Cancelar inscrição" com confirmação na tela Eventos) e a equipe cancela pelo `DELETE /api/inscricoes/{id}`, com a mesma regra (presença pendente — sem pedido de check-in — e evento que ainda não começou, senão `409`; desde 09/11/2026 o pedido de check-in em aberto também impede, `409 CHECKIN_JA_SOLICITADO`); e-mail de aviso ao aluno quando é a equipe (falha de envio não desfaz o cancelamento); auditoria `INSCRICAO_CANCELADA`; o aluno pode se inscrever de novo se houver vaga | API R27 | OK (04/11/2026) | Implementado em 04/11/2026 |
| 35 | Presença travada depois do questionário (RF015): com qualquer tentativa do aluno no evento, mudar a presença ou excluir/cancelar a inscrição responde `409` "A presença não pode mais ser alterada: o aluno já respondeu o questionário."; desde 09/11/2026 vale para a reversão da decisão do check-in, e o painel "Check-ins" desabilita o botão de reverter | API R28 e R43 | OK (04/11/2026) | Implementado em 04/11/2026 |
| 36 | Ocupação das salas pelo uso real (RF021): para cada evento **encerrado** (horário + carga horária já passou), alunos com check-in PRESENTE ÷ capacidade da sala, em %; evento futuro ou em andamento e sala com capacidade 0 ficam fora; sem evento encerrado, "—". O Dashboard mostra a média geral no cartão "Ocupação média das salas" ("Presentes ÷ capacidade, média dos eventos encerrados") e a tela Salas mostra, por sala, "Eventos realizados" e "Ocupação média" — mesma função no backend (`utils/ocupacao.ts`). A barra dos próximos eventos continua em inscritos ÷ capacidade e passou a se chamar "vagas preenchidas" | API R25 (dashboard x cálculo direto no banco) e R34 (sala de 10 lugares com 4 inscritos e 2 presentes = 20%, não 40%; evento futuro e em andamento não mudam a média; sala sem evento encerrado volta com 0 e null; dashboard = média das salas; aluno lista as salas sem os números novos); Interface "Equipe entra só com a senha" | OK (09/11/2026) | Implementado em 04/11/2026 como inscritos ÷ capacidade de todos os eventos; **alterado em 09/11/2026** para o uso real (presentes, só eventos encerrados) e levado também para a tela Salas |
| 37 | Deploy só pela Vercel | Conferência do `frontend/package.json` e do `package-lock.json` | OK | Removidos o script `deploy` (gh-pages) e a dependência `gh-pages` (`npm uninstall`, que tirou só ela e as dependências exclusivas dela do lock) |
| 38 | Direitos do titular (RF026, versão enxuta): página **"Meus dados"** (só aluno, menu depois de "Minha conta"), só para consulta, com dados cadastrais (nome, e-mail, RGM, cadastro, aceite e versão dos termos, situação do 2FA), inscrições e presenças, questionários (acertos e percentual, sem gabarito nem respostas), certificados e avaliações — `GET /api/meus-dados`, sempre do participante do token, sem cache; os demais pedidos (cópia, correção, exclusão, revisão humana da correção automática do questionário, oposição) pelo e-mail `privacidade@sgeacademicos.com.br`, em até 15 dias | API R30 (401 sem token, 403 para a equipe, conteúdo comparado com o banco, nada de gabarito/respostas/senha/ids, consulta não grava nada, `/meus-dados/exportacao` → 404); Interface "Meus dados do aluno e reprovação no questionário (RF026)" (menu, seções, reprovado nas 2 tentativas sem nova tentativa nem pedido de revisão nem certificado, sem botão de baixar nem bloco de pedidos, nome no topo sem a janela "Informações do usuário") e "Auditoria: filtro pelas ações novas" (sem a opção "Dados exportados pelo titular", equipe sem o item no menu) | OK (04/11/2026) | Implementado em 04/11/2026, sem mudança no banco. No mesmo dia saíram a exportação em JSON, o bloco "Outros pedidos sobre seus dados", o link "Pedir revisão do resultado" e a janela "Informações do usuário". Política de Privacidade (página e `docs/lgpd/politica-de-privacidade.md`) e `docs/lgpd/08` descrevem exatamente isso |

| 39 | Confirmação do e-mail no cadastro: `POST /api/auth/registro` valida tudo, guarda o cadastro em `cadastros_pendentes` por 15 minutos (senha e código só como hash) e manda um código de 6 dígitos ao e-mail institucional (`202`, sem criar conta); `POST /api/auth/registro/confirmar` cria a conta com o código certo (`201`), com o instante e a versão do aceite; código errado → `422 CODIGO_INVALIDO`, no 5º erro o código deixa de valer; expirado → `422 CODIGO_EXPIRADO`; `POST /api/auth/registro/reenviar-codigo` gera código novo (60 s entre envios, `429`); 5 envios por e-mail e 20 por IP (`429`); pendente expirado apagado no cadastro, a cada login e na tentativa de confirmar/reenviar; falha de envio em produção → `503` com o pendente guardado; auditoria `CADASTRO_INICIADO`, `CADASTRO_CODIGO_REENVIADO` e `CADASTRO_CONCLUIDO` sem dado pessoal. Tela: etapa 2 com o e-mail, a validade, o aviso de spam e o de que sair da página não conclui o cadastro; campo só numérico; "Reenviar código" com contagem de 60 s; "Corrigir meus dados" sem perder o que foi digitado; com o código certo entra direto em Eventos | API R01 e R32; Interface "Cadastro: confirmação do e-mail por código" | OK (06/11/2026) | Implementado em 06/11/2026 (migration `20261106120000_cadastros_pendentes`, só cria a tabela nova) |
| 40 | Regra da senha nova (cadastro e nova senha da recuperação): de 8 a 64 caracteres, com pelo menos uma letra maiúscula (acentuada conta), um número e um caractere especial; a mesma função no frontend e no backend (RNF006); o login não confere a regra. Tela: lista "Mínimo de 8 caracteres / Uma letra maiúscula / Um número / Um caractere especial" com ✓ verde ou • cinza a cada tecla (ícone e texto, `aria-live`), aviso acima de 64 caracteres e erro embaixo do campo ao enviar | API R33 e R17; Interface "Regras da senha com checklist" e "Esqueci a senha" | OK (06/11/2026) | Implementado em 06/11/2026. Antes a regra era só "8 caracteres ou mais". As senhas das contas de demonstração do seed vêm das variáveis `SEED_*_SENHA` do `backend/.env` local (nunca do código nem da documentação) e precisam seguir a regra; contas que já existiam mantêm a senha |
| 41 | E-mail do aluno não editável: `PUT /api/participantes/{id}` com `email` (mesmo igual ao atual) → `422` "O e-mail não pode ser alterado."; nome e RGM continuam corrigíveis; na tela Participantes o e-mail aparece só para leitura, com a explicação; o e-mail dos palestrantes continua editável | API R15; Interface "Inativação" (edição do participante) | OK (06/11/2026) | Implementado em 06/11/2026. Antes a equipe trocava o e-mail, que era também o login do aluno |
| 42 | Confirmação ao sair: o botão "Sair" abre "Sair do sistema?" ("Você vai precisar entrar de novo com seu e-mail e senha.", botões "Sair" e "Cancelar"); a saída automática (sessão expirada, troca de senha, inativação) continua sem confirmação | Interface "Sair pede confirmação" (e todas as saídas do teste passam pela confirmação) | OK (06/11/2026) | Implementado em 06/11/2026 |
| 43 | Termos de Uso e Política de Privacidade na versão 3 (06/11/2026), com o mesmo texto na página e no markdown: confirmação do e-mail (dados guardados por até 15 minutos, art. 7º, V), SendGrid enviando o código, e-mail não alterável, regra da senha; sem a anonimização, que o sistema não faz; `VERSAO_TERMOS_ATUAL` = "3" | Leitura das páginas e dos markdowns; API R01 (a conta nova grava a versão 3) | OK (06/11/2026); o reaceite de quem aceitou a versão 2 ainda não tem tela (ver pendências) | Implementado em 06/11/2026. Antes a página mostrava a versão 1 e o markdown a versão 2, com promessas que o sistema não cumpria (anonimização automática, declaração de maioridade) |

| 44 | Indicador de aprendizagem no Dashboard (RF021): para cada evento, entre os alunos com presença confirmada, quantos foram **aprovados** (alguma tentativa com 60% ou mais), **reprovados** (usaram as 2 tentativas abaixo de 60%) e **ainda podem responder** (nenhuma tentativa, ou 1 abaixo de 60%); taxa de aprovação geral = aprovados ÷ (aprovados + reprovados). Tela: cartão "Aprovação no questionário" ("aprovados ÷ alunos que concluíram o questionário") e gráfico "Aprendizagem por evento" no estilo do "Presença por evento" (barras empilhadas verde/cinza/vermelho, legenda, "Ver dados em tabela"); os 8 cartões em 2 linhas de 4 no desktop. Sem dado pessoal na resposta | API R25 (aprovado e reprovado no evento principal, "ainda pode responder" com 1 tentativa abaixo de 60% no evento passado, soma = presentes em todo evento, contagens e taxa conferidas com o cálculo direto no banco, certificados liberados = aprovados, nenhum nome/e-mail/RGM/id de aluno); Interface "Dashboard: indicador de aprendizagem (RF021)" (2 linhas de 4, cartão com a taxa, legenda, aprovada em verde e reprovada em vermelho, tabela) | OK (06/11/2026) | Implementado em 06/11/2026, sem mudança no banco. "Certificados liberados" passou a sair da mesma conta (são os aprovados entre os presentes) |

| 45 | Check-in pedido pelo aluno (etapa 4): estados PENDENTE (sem pedido), SOLICITADO (pediu), PRESENTE (aprovado — só ele libera o questionário), RECUSADO (recusado ou expirado; final para o aluno) e AUSENTE (não pediu a tempo). Janela de 1 hora antes do início até 24 horas depois do fim (`ANTECEDENCIA_CHECKIN_MS` e `PRAZO_CHECKIN_APOS_FIM_MS`); fora dela a API recusa o pedido e a decisão (`409 CHECKIN_NAO_LIBERADO` / `CHECKIN_ENCERRADO`). O aluno pede com o participante do token, só com conta ativa, evento aprovado, inscrição PENDENTE; a tela pergunta "Confirma que você está no local do evento?" e mostra a situação ("Aguardando aprovação do check-in", "Presença confirmada", "Check-in recusado", "Ausente"), sem e-mail. Decidem o professor dono do evento (`403` nos outros), a secretaria e o administrador: Aprovar, Recusar (sem motivo), Aprovar todos (só os SOLICITADO daquele evento) e reverter PRESENTE ↔ RECUSADO dentro da janela, tudo com confirmação; grava quem decidiu e quando (`usuarioId`, `dataCheckin`). Tela Check-in: eventos com a janela aberta (professor só os dele) com os pedidos pendentes, e painel "Check-ins" também dentro do evento (tela Eventos). Expiração sem processo agendado: `expirarCheckins` (`updateMany`, idempotente) roda antes das listas de check-in e inscrições, do dashboard, do questionário, dos certificados e de Meus dados; uma linha de auditoria `CHECKIN_EXPIRADO` por execução que mudou algo, só com as quantidades. Auditoria: `CHECKIN_SOLICITADO`, `CHECKIN_APROVADO`, `CHECKIN_RECUSADO`, `CHECKIN_REVERTIDO`, `CHECKIN_APROVADO_TODOS` (com a quantidade). Dashboard: presentes = PRESENTE, ausentes = AUSENTE + RECUSADO, aguardando = PENDENTE + SOLICITADO (ocupação continua só com PRESENTE). Filtro de Inscrições com SOLICITADO e RECUSADO; Meus dados com a situação nova e a hora do pedido | API R12 (pedido antes da janela, dentro dela, repetido, sem inscrição, pela equipe; rota antiga 404; SOLICITADO não libera o questionário), R27 (SOLICITADO não cancela), R38 (mais de 24 h depois do fim) e R43 (evento pendente, professor aprova o dele e recebe 403 no de outro, secretaria e administrador aprovam qualquer um, recusa impede novo pedido, reverter nos dois sentidos, reverter depois do questionário → `PRESENCA_TRAVADA`, aprovar todos, expiração e segunda execução sem mudança, dashboard, filtros e Meus dados); Interface "Check-in: o aluno pede, a equipe aprova" | OK (09/11/2026) | Implementado em 09/11/2026 (migration `20261109210000_checkin_pedido_pelo_aluno`) |

| 46 | Calendário de eventos (etapa 5): a tela Eventos da equipe e do professor deixou de ser uma tabela com todos os eventos. Mês atual com setas, "Hoje" e o nome do mês; semana começando no domingo, dias de fora do mês apagados, hoje destacado; até 3 eventos por dia (horário e título cortado) e "+N"; marcações com cor **e** símbolo com `title` (aguardando aprovação, recusado, alteração aguardando aprovação, encerrado apagado, "N check-ins"). Clicar num dia abre a lista dele ao lado (embaixo, em tela estreita) com as ações de sempre (aprovar/recusar, reenviar, Check-ins, histórico, editar, excluir, conforme o perfil e as travas); dia vazio de hoje em diante abre o cadastro com a data preenchida. Busca (título, tema, palestrante ou sala) e filtro de situação mostram o resultado em lista, de qualquer mês, e o resultado leva o calendário ao dia do evento. Celular: um marcador por dia, sem rolagem lateral. API: `GET /api/eventos?de=&ate=` (só o mês na tela; o professor recebe os eventos dos outros só como "Sala ocupada" — sala, início e fim) e `GET /api/eventos/busca` (no servidor, com limite); sem intervalo a rota é a mesma de antes e a programação do aluno não mudou | API R44 (intervalo, secretaria completa, professor com os dele completos e os dos outros sem título/palestrante/inscritos/id, recusado não ocupa, intervalo inválido, check-ins pendentes, limite da busca, busca por sala e por situação, busca do professor, aluno `403`, rota sem intervalo e aluno inalterados); Interface "Calendário de eventos (equipe e professor)" (mês atual e hoje, marcação de check-in, lista do dia, Check-ins pelo calendário, trocar de mês, dia vazio do futuro abre o cadastro com a data, dia passado não abre, busca leva ao dia, celular sem rolagem lateral, professor vê "Sala ocupada") | OK (09/11/2026) | Implementado em 09/11/2026, sem migration |

| 47 | Primeiro acesso do professor só pelo convite: ao criar a conta ou reenviar, chave aleatória de 32 bytes (`crypto.randomBytes`, base64url), só o SHA-256 dela no banco, nova chave invalida a anterior; e-mail com o botão "Criar minha senha" e o link em texto (`APP_URL/#/primeiro-acesso?convite=...`, a chave depois do `#`), sem código; abrir o link não gasta o convite (`POST /api/auth/primeiro-acesso/convite` só devolve o e-mail); o convite é usado ao enviar senha + aceite (uso único, 24 h); chave inexistente, vencida ou usada → o mesmo `422 CONVITE_INVALIDO`, e chave errada conta no limite por IP; tela sem link no login, com o e-mail só para leitura, a senha com a lista de requisitos e o aceite; a chave sai do endereço (`history.replaceState`); sem convite, só a mensagem; "Reenviar convite" na tela Professores; sem `APP_URL`, criar professor e reenviar convite são recusados; "Esqueci minha senha" de conta que espera o convite responde igual a e-mail inexistente e não troca a senha | API R35 (sem APP_URL, link e e-mail sem código, só o hash no banco, consulta não gasta, sem aceite, senha fraca, chave inexistente, esqueci a senha e confirmação, convite vencido, reenvio invalida o anterior, ativação grava os Termos, reuso recusado, rota antiga 404, limite por IP); Interface "E / Login" e "Proposta de alteração, questionário travado e inativação do professor" (login sem o link, página sem convite e com convite inválido só com a mensagem, link abre com o e-mail e pede só senha e aceite, a chave some do endereço, ativação leva ao login) | OK (09/11/2026) | Implementado em 09/11/2026, sem migration |

| 48 | Contas fictícias nunca recebem e-mail: `usuarios.ficticio` (padrão false, não aparece em tela nem na API); o módulo de e-mail confere o destinatário antes de enviar e, se for conta fictícia, não envia (log "envio suprimido (conta fictícia)", sem o endereço; auditoria com "suprimido: conta fictícia"). No aviso de mudança do evento, os inscritos fictícios saem da lista e os reais continuam recebendo. Inscrição, cancelamento e mudança de horário funcionam normalmente. O sistema não manda e-mail para palestrante | API R45 | OK (09/11/2026) | Implementado em 09/11/2026 (migration `20261109230000_conta_ficticia`) |
| 49 | Carga de demonstração (`backend/scripts/carga-demonstracao.ts`): simula por padrão; com `--aplicar`, salva cópia de todas as tabelas em `backend/backups/` (fora do git) antes de apagar e não apaga se a cópia falhar; apaga tudo na ordem das chaves estrangeiras e carrega 12 salas, 40 palestrantes, 150 professores e 1.000 alunos fictícios, 200 eventos (140 passados, 10 nos próximos 7 dias, 50 de 8 a 30 dias) com aprovação, histórico, inscrições, check-in, questionário, certificados e avaliações, as três contas de demonstração e um único registro de auditoria; confere conflito de sala, capacidade, duplicidade e palavras proibidas antes de gravar | Rodada no `SGEA_dev` em 46 s; conferência no banco (sem conflito, sem excesso de capacidade, e-mails e RGMs únicos, sem palavras proibidas, evento de 13/11 21:00 com 12 pedidos, login das três contas sem 2FA, Dashboard com ocupação, presença e certificados) — ver `docs/lgpd/10` | OK (09/11/2026) | Implementado em 09/11/2026 |

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

- Continuam pendentes: tela da equipe para registrar e responder as
  solicitações do titular que chegam por e-mail, correção feita pelo
  próprio aluno (hoje pelo e-mail, ver `docs/lgpd/08`) e rotina automática
  de retenção.
- **Tela de novo aceite dos Termos — evolução futura.** Com a versão 3
  vigente desde 06/11/2026, o login devolve `precisaAceitarTermos: true`
  para quem aceitou uma versão anterior, e a rota
  `POST /api/auth/aceitar-termos` existe, mas o frontend ainda não pede o
  novo aceite. **Decisão:** antes da apresentação, a base é reiniciada e
  todas as contas são criadas já na versão vigente dos Termos (o cadastro
  grava a versão 3), então ninguém na demonstração fica com o aceite de uma
  versão antiga. A tela de reaceite fica para quando os Termos mudarem com
  contas reais em uso.
- ~~`POST /auth/recuperacao-senha` responde 404 quando o e-mail não está
  cadastrado~~ — resolvido em 05/11/2026 (item 20).
- ~~Documentos de LGPD (`docs/lgpd/01` inventário, `02` matriz e `04`
  retenção) não citavam a tabela `certificados`~~ — resolvido em 06/11/2026:
  os três descrevem a cópia do nome e do RGM gravada na emissão, a
  finalidade (validação pública do código, RF027), a retenção (enquanto o
  certificado precisar ser verificável) e a regra de que o aluno com
  certificado não é removido, só inativado. O `02` e o `08` também passaram
  a descrever a exclusão a pedido como acontece hoje (a equipe remove a
  conta e o histórico, ou só inativa quando há certificado), sem prometer
  anonimização, que continua só como plano no `04`.
