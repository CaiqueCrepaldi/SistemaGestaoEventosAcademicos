# Evidências de implementação e testes — SGEA

**Data:** 12/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Para cada controle, onde está no código, como foi testado e o resultado.
Controles que ainda não existem aparecem como "pendente", sem evidência. A
verificação de todos os requisitos funcionais está em
`docs/verificacao-de-requisitos.md`.

## Testes automatizados (banco de desenvolvimento `SGEA_dev`)

| Teste | Comando | Resultado em 13/11/2026 |
|---|---|---|
| Requisitos pela API | `cd backend && npx tsx scripts/testar-requisitos.ts` | **652/652** verificações |
| 2FA pela API | `cd backend && npx tsx scripts/testar-2fa.ts` | **55/55** |
| Interface com navegador de verdade | passo a passo no topo de `frontend/testes-interface/testar-interface.mjs` (rodado no Microsoft Edge, numa cópia com `channel: "msedge"`) | **224/224** |
| Demonstração do hash de senha | `cd backend && npx tsx scripts/demonstrar-hash-senha.ts` | ver `07`, "Formato do hash de senha" |
| Carga de demonstração | `cd backend && npx tsx scripts/carga-demonstracao.ts --aplicar` | 46 s; conferência no banco abaixo |
| E-mails repetidos (só leitura) | `cd backend && npx tsx scripts/verificar-emails-duplicados.ts` | 1.154 contas, nenhum e-mail repetido nem fora do padrão |

Os scripts de teste se recusam a rodar se o `DATABASE_URL` não for o
`SGEA_dev`, criam os próprios dados e apagam no final.

## Controles implementados

| Controle | Onde no código | Como foi testado | Resultado |
|---|---|---|---|
| Autorização por perfil em toda rota | `middleware/auth.ts` e todas as `*.routes.ts` | R04: aluno nas rotas da equipe → `403`; sem token → `401`. R36: professor sem Auditoria, Participantes e criação de sala; evento de outro → `404`. R36 e R50: professor sem certificados e avaliações → `403` | Confirmado |
| `participanteId` sempre do token | `feedbacks.routes.ts`, `eventos.routes.ts`, `inscricoes.routes.ts` | R08, R10 e R14: id de outro aluno no corpo ou na URL é ignorado | Confirmado |
| Hash de senha bcrypt custo 12 com salt; rehash no login | `utils/password.ts`, `auth.service.ts` | R20: hash de custo 10 vira 12 no login, sem trocar a senha; mesma senha em duas contas gera hashes diferentes | Confirmado |
| Nome, e-mail e RGM em texto, cada um numa tabela só | `schema.prisma`, `participantes.service.ts` | R24: cadastro grava em texto e a senha só como hash | Confirmado |
| Criptografia só do que é credencial | `utils/criptografia.ts`, `mfa.service.ts` | `testar-2fa.ts`: segredo do 2FA gravado cifrado | Confirmado |
| Conta do aluno só depois de confirmar o e-mail | `auth.service.ts`, `cadastros_pendentes` | R01 e R32: nenhuma conta antes do código; código e senha só em hash; 5 tentativas; reenvio com 60 s; expiração; limites por e-mail e IP | Confirmado |
| Regra da senha nova | `utils/validacao.ts` (backend e frontend) | R33 e R17: senha fora da regra → `422`; interface com a lista de requisitos | Confirmado |
| Troca de senha pela Minha Conta | `troca-senha.service.ts`, `auth.schemas.ts`, `AlterarSenha.tsx` | R46: os quatro perfis trocam; a senha antiga deixa de entrar; o token antigo cai e a sessão devolvida vale; senha atual errada conta no limite e 5 erros bloqueiam; regra, igual à atual e confirmação recusadas; com 2FA, sem código recusado e com código (ou de recuperação) aceito; código de "Esqueci minha senha" pendente invalidado; auditoria sem senha nem e-mail. Interface: trocar, sair e entrar com a nova | Confirmado |
| E-mail do aluno não editável | `participantes.routes.ts` | R15: `PUT` com e-mail → `422` | Confirmado |
| Professor ativado só pelo convite | `professores.service.ts`, `auth.routes.ts`, `PrimeiroAcessoPage.tsx` | R35: link com a chave depois do `#`, sem código; só o SHA-256 no banco; consultar não gasta; sem aceite → `422`; uso único; vencido recusado; reenvio invalida o anterior; chave errada cai no limite por IP; "Esqueci a senha" de quem espera o convite responde igual a e-mail inexistente; sem `APP_URL`, criar professor é recusado. Interface: login sem link de primeiro acesso; a chave some do endereço | Confirmado |
| Check-in pedido pelo aluno e decidido pelo professor do evento ou pela equipe | `modules/checkin/`, `utils/checkin.ts` | R12 e R43: fora da janela recusado; professor de outro evento → `403`; grava quem decidiu e quando; recusa impede novo pedido; reversão dentro do prazo; depois do questionário → `PRESENCA_TRAVADA`; expiração idempotente; dashboard pela regra nova | Confirmado |
| Aprovação, propostas de alteração e questionário travado | `eventos.service.ts`, `palestrantes.service.ts` | R37 a R41 | Confirmado |
| Tela Equipe: secretaria por convite, quem gerencia quem e exclusão | `professores.service.ts`, `professores.routes.ts`, `EquipePage.tsx` | R48: o administrador cria a secretaria por convite (só o hash da chave), ela não entra antes de usar o convite e entra depois como SECRETARIA; a secretaria não cria, não inativa nem exclui secretaria (`403`); ninguém mexe na própria conta; conta de administrador não é inativada nem excluída; inativar derruba a sessão; conta ativa não é excluída; secretaria inativa sem histórico é excluída e os logs dela ficam; convite pendente sai junto com a conta; professor com histórico fica inativo com a mensagem. Interface: aba Equipe, `/professores` leva a ela, modal com perfil só para o administrador, exclusão da conta pendente | Confirmado |
| Avaliação pela presença, auditoria só do administrador, e-mails no modelo do site | `feedbacks.service.ts`, `checkin.service.ts`, `auditoria.routes.ts`, `conteudos-email.ts` | R49: a secretaria recebe `403` na auditoria e o administrador vê; PRESENTE avalia sem questionário; SOLICITADO, RECUSADO, AUSENTE, sem check-in e cancelada recusados; desfazer a presença de quem só avaliou apaga a avaliação (auditoria só com ids); com o questionário respondido, `PRESENCA_TRAVADA`; evento lotado recusa e a vaga volta depois do cancelamento; todo e-mail com HTML e texto; `<script>` escapado. Interface: secretaria sem a aba Auditoria; opções, busca e "Sem vagas" na tela do aluno; Termos na Minha conta | Confirmado |
| Professor sem certificados e avaliações | `certificados.routes.ts`, `feedbacks.routes.ts`, `checkin.service.ts`, `dashboard.service.ts`, `App.tsx`, `Layout.tsx` | R36 e R50: as seis rotas de certificados e avaliações → `403` para o professor, mesmo nos eventos dele; aluno e equipe → `200`; validação pública sem login continua; painel do check-in sem `avaliou` para o professor e com ele para a equipe. Interface: menu do professor sem as duas abas; `/certificados` e `/feedback` levam ao Dashboard | Confirmado |
| Professor só nos próprios eventos também nas inscrições | `utils/escopo.ts` (`garantirEventoDoProfessor`), `inscricoes.service.ts`, `inscricoes.routes.ts`, `InscricoesPage.tsx` | R36 e R50: inscrever, cancelar e listar em evento de outro professor ou da equipe → `403` com a mensagem; no próprio → `201`; a equipe → `201` em qualquer evento; conflito de horário → `409` para o professor e para a equipe | Confirmado |
| Dashboard do professor só com os dados dele | `dashboard.service.ts`, `DashboardPage.tsx` | R50: dois professores com um evento cada, no mesmo horário: cada dashboard só com o próprio evento e as próprias inscrições, sem `certificadosLiberados`, `mediaFeedback` e `totalFeedbacks`; o da equipe com os dois eventos e os campos. Interface: subtítulo "Dados dos seus eventos" sem os cartões de certificados e avaliações | Confirmado |
| Aviso de recusa com X que só volta com recusa nova | `aprovacoes.service.ts` (`recusas`), `Layout.tsx` (localStorage por usuário, em try/catch) | R50: um id por recusa em aberto; reenviado, sai; recusado de novo, id novo; a equipe não recebe a lista. Interface: o X fecha; continua fechado ao trocar de tela e depois do F5; uma recusa nova faz o aviso voltar | Confirmado |
| Exclusão de palestrante só depois da decisão | `palestrantes.service.ts`, `PalestrantesPage.tsx` | R50: aguardando aprovação e com proposta aguardando → `409` com a orientação; aprovado e recusado sem evento → `204`; R07: com evento → `409`. Interface: Excluir desabilitado com a orientação no palestrante aguardando | Confirmado |
| E-mail único entre as contas e gravado normalizado | `utils/validacao.ts` (`normalizarEmail`), `auth.schemas.ts`, `professores.schemas.ts`, `professores.service.ts`, `palestrantes.schemas.ts`, `prisma/contas-demonstracao.ts`, `scripts/carga-demonstracao.ts` | R50: conta da Equipe com e-mail de aluno → `422`; de outra conta, em maiúsculas e com espaços, noutro perfil, e de cadastro em andamento → `409`; conta nova gravada em minúsculas; cadastro de aluno com e-mail de professor não cria nada; com e-mail já usado em maiúsculas → `409`; palestrante em minúsculas e único só entre palestrantes. `scripts/verificar-emails-duplicados.ts` no `SGEA_dev`: 1.154 contas, nenhum e-mail repetido nem fora do padrão. Simulação da carga passa nas conferências novas | Confirmado |
| Cancelamento de evento só pela equipe, com motivo e e-mail aos inscritos | `eventos.service.ts` (`cancelar`), `eventos.schemas.ts`, `utils/escopo.ts` (`garantirEventoNaoCancelado`), `conteudos-email.ts`, `CancelarEvento.tsx` | R51: professor `403` (até no próprio evento); motivo vazio, curto e longo `422`; pendente, recusado, iniciado e já cancelado `409`; inscrições mantidas; proposta pendente recusada; e-mail aos inscritos reais e ao professor, conta fictícia suprimida, motivo escapado; auditoria sem o motivo; depois do cancelamento, inscrição, cancelamento de inscrição, check-in, questionário, certificado, avaliação, edição e exclusão `409`; sala e horário do aluno livres; fora do Dashboard e da tela Check-in. Interface: modal com o botão desativado até o motivo, etiqueta "Cancelado" no calendário e na tela do aluno, professor sem o botão | Confirmado |
| Inscrição no mesmo horário recusada | `inscricoes.service.ts` (`garantirSemConflitoDeHorario`), `eventos.service.ts` (`autoinscrever`) | R47: o aluno e a equipe recebem `409 CONFLITO_DE_HORARIO` com o título e o horário do outro evento; evento que só encosta é aceito; inscrição cancelada não conta; mudar o horário de um evento não cancela inscrição | Confirmado |
| Inativação de aluno e de professor | `participantes.service.ts`, `professores.service.ts` | R16: aluno inativo não entra, sessões caem, inscrições sem pedido canceladas. R42: professor inativo não entra; eventos em aberto transferidos, com histórico e auditoria | Confirmado |
| Calendário: o professor vê os eventos dos outros só como "Sala ocupada" | `eventos.service.ts` (`calendario`) | R44: resposta ao professor sem título, palestrante, inscritos nem id dos outros. Interface: "Sala ocupada" sem título | Confirmado |
| Contas fictícias nunca recebem e-mail | `email.service.ts`, `usuarios.ficticio` | R45: envio para conta fictícia suprimido, conta normal recebe; inscrição, mudança de horário e cancelamento funcionam sem e-mail; o campo não aparece na API | Confirmado |
| Avaliação sem edição; exclusão pelo aluno ou pela equipe com motivo | `feedbacks.routes.ts`, `feedbacks.service.ts` | R22 e R14 | Confirmado |
| 2FA opcional, segredo e QR no servidor, códigos de recuperação, reuso, bloqueio, reset | `modules/mfa/`, `scripts/resetar-2fa.ts` | `testar-2fa.ts` (55 verificações) | Confirmado |
| Limite de tentativas (conta e IP) | `utils/limiteAcesso.ts` | R02, R32, R35 e `testar-2fa.ts` | Confirmado |
| Invalidação de sessão | `middleware/auth.ts`, `usuarios.versaoToken` | R16, R17, R42 e `testar-2fa.ts`: token antigo → `401` | Confirmado |
| Trilha de auditoria sem dado pessoal | `utils/auditoria.ts` | R18: nenhum log do teste tem e-mail, RGM, senha, código, comentário ou motivo de inativação | Confirmado, 0 vazamentos |
| Aceite dos Termos versão 1, datado pelo servidor | `config/termos.ts`, `auth.service.ts`, `professores.service.ts` | R01 e R35: a conta grava o instante e a versão "1" | Confirmado |
| Validação pública do certificado sem RGM | `certificados.service.ts` | R29 | Confirmado |
| Página "Meus dados" | `modules/titular/` | R30: só o próprio aluno; sem gabarito, senha ou ids; mostra o check-in | Confirmado |
| Separação de ambientes | `.env` → `SGEA_dev`; `.env.production.local` só com `--producao` | Todos os testes rodaram no `SGEA_dev` | Confirmado |
| Sem serviço externo além dos três documentados | `frontend/index.html`, `package.json` | Inspeção de dependências e imports | Confirmado |

## Carga de demonstração (09/11/2026, `SGEA_dev`)

Conferido consultando o banco depois de `carga-demonstracao.ts --aplicar`:
nenhum conflito de sala; nenhum evento acima da capacidade; 1.153 contas com
1.153 e-mails distintos; 1.000 RGMs distintos no formato `09` + 9 dígitos;
nenhuma ocorrência de "teste", "demo", "fake" ou "exemplo" nos dados; as três
contas de demonstração entram sem 2FA, com o aceite da versão 1; o evento da
apresentação (13/11/2026, 21:00) tem 35 inscritos e 12 pedidos de check-in
entre 20:00 e 20:15, listados no painel do professor; a auditoria começa com
um único registro (`CARGA_DEMONSTRACAO`); o Dashboard mostra ocupação,
presença e certificados; um certificado da carga valida pela consulta
pública.

## Controles pendentes — sem evidência ainda

| Controle | Onde vai ficar | Como será testado |
|---|---|---|
| Tela de reaceite dos Termos quando a versão mudar | Frontend, depois do login (o backend já devolve `precisaAceitarTermos` e tem `POST /api/auth/aceitar-termos`) | Conta com versão antiga entra, a tela pede o aceite e registra `TERMOS_REACEITOS` |
| Tela da equipe para registrar e responder os pedidos do titular | Tabela `solicitacoes_titular` (já existe) | Pedido registrado, atendido e auditado |
| Cópia e correção feitas pelo próprio aluno em "Meus dados" | `modules/titular/` | Exportação com todos os campos esperados e nenhum a mais |
| Anonimização em vez de exclusão | `participantes.service.ts` | Depois da exclusão, nada identifica a pessoa; estatísticas preservadas |
| Rotina de retenção automática | Rota protegida + agendamento | Rodar duas vezes sem repetir ação; cada critério com dado fabricado |
