# Procedimento para atender aos direitos dos titulares — SGEA

**Data:** 04/11/2026 · **Versão:** 3 (RF026 em versão enxuta: página "Meus
dados" só para ver os próprios dados; todos os outros direitos atendidos
manualmente pelo e-mail de privacidade)

**Situação atual:** o titular (aluno) exerce sozinho, dentro do sistema,
só o **acesso**, pela página "Meus dados". Todos os outros direitos —
inclusive receber uma cópia dos dados (portabilidade) — chegam pelo e-mail
`privacidade@sgeacademicos.com.br` e são atendidos manualmente pela equipe,
com resposta em **até 15 dias corridos**. Não existe tela da equipe para
registrar e acompanhar esses pedidos (ver "Fora desta versão", no fim).

## Direitos cobertos (art. 18 da LGPD) e como cada um é atendido

| Direito | Como o titular exerce | Como a equipe atende | Prazo |
|---|---|---|---|
| Confirmação da existência de tratamento e acesso aos dados | **No sistema:** página "Meus dados" (`GET /api/meus-dados`) — dados cadastrais (nome, e-mail, RGM, data do cadastro, data e versão do aceite dos termos, situação do 2FA), inscrições e presenças, resultados dos questionários (acertos e percentual, sem gabarito nem respostas), certificados e avaliações | Nada a fazer. Se a pessoa não consegue entrar no sistema, ela pede por e-mail (ver "Atendimento pelo e-mail", passo 4) | Imediato (tela) |
| Portabilidade (cópia dos dados para levar a outro serviço) | E-mail | Monta a cópia com o mesmo conteúdo da página "Meus dados", a partir das telas de gestão (Participantes, Inscrições, Check-in, Certificados e Feedback), e envia ao titular pelo e-mail cadastrado. O sistema não gera essa cópia sozinho (a exportação em arquivo existiu por poucas horas em 04/11/2026 e saiu) | Até 15 dias |
| Correção de dado incorreto ou desatualizado | E-mail | Corrige nome, e-mail ou RGM na tela **Participantes** (vale também para a conta de login do aluno); fica na auditoria (`PARTICIPANTE_ATUALIZADO`, só com os nomes dos campos) | Até 15 dias |
| Anonimização ou eliminação | E-mail | Inativa o aluno na tela **Participantes** (derruba as sessões e cancela as inscrições pendentes de eventos futuros) e depois exclui. **Exceção:** aluno com certificado emitido não pode ser excluído (`409 PARTICIPANTE_COM_CERTIFICADO`) — a conta fica inativada e o registro do certificado é mantido, porque comprova a participação; isso é explicado na resposta e na Política (seção 7 do texto da página do sistema). A anonimização automática ainda não existe | Até 15 dias |
| Revisão de decisão automatizada (art. 20 — o questionário corrigido pelo sistema libera o certificado) | E-mail (não há atalho na tela) | Uma pessoa da equipe confere as respostas da tentativa contra o gabarito do evento e responde explicando o resultado. A revisão só verifica se a correção automática está certa: **não é uma nova tentativa** — o aluno tem 2 tentativas e, se não atingir 60% em nenhuma, não recebe o certificado daquele evento. Não existe tela para alterar o resultado: se a revisão encontrar erro do sistema (ex.: gabarito errado), a correção é feita pela equipe técnica e registrada na resposta | Até 15 dias |
| Oposição ao tratamento / informação sobre compartilhamento | E-mail | Responde com base na Política de Privacidade (operadores: Vercel, TiDB Cloud, SendGrid) e avalia o pedido de oposição caso a caso | Até 15 dias |
| Revogação de consentimento (feedback) | **No sistema:** o próprio aluno exclui o feedback dele a qualquer momento na tela Feedback (botão "Excluir", com confirmação; `DELETE /api/feedbacks/:id`) e pode enviar outro para o mesmo evento. Ninguém edita feedback depois de enviado | Nada a fazer. A equipe só exclui feedback com motivo de lista fechada; tudo fica na auditoria (`FEEDBACK_EXCLUIDO`) | Imediato |

## Atendimento pelo e-mail

1. **Conferir a identidade.** O pedido precisa vir do e-mail institucional
   cadastrado na conta (o mesmo do login). Pedir o RGM, que ajuda a achar o
   cadastro na tela Participantes. Se o e-mail de origem for outro, pedir a
   confirmação pelo e-mail cadastrado antes de agir.
2. **Registrar o pedido** no controle da equipe: data de recebimento, tipo
   (cópia, correção, exclusão, revisão, oposição, outro), prazo final
   (recebimento + 15 dias) e, depois, a data e o resumo da resposta. O
   controle não pode guardar mais dado pessoal que o necessário (o RGM
   basta para localizar a pessoa).
3. **Atender** conforme a tabela acima. Toda alteração feita pelas telas
   do sistema já fica na trilha de auditoria.
4. **Responder** ao titular pelo mesmo e-mail, dentro do prazo, dizendo o
   que foi feito ou, se o pedido for negado (total ou parcialmente), o
   motivo. Pedido de acesso por quem não consegue entrar no sistema:
   primeiro orientar a recuperar o acesso ("Esqueci a senha", ou
   desbloqueio da conta pelo administrador na tela Participantes) para a
   própria pessoa usar a página "Meus dados"; se não for possível (ex.:
   conta inativada), a equipe envia a cópia como na linha "Portabilidade".

## Tabela de solicitações (`solicitacoes_titular`)

A tabela existe no banco (com `tipo`, `status`, `descricao`, `resposta`,
`atendidoPorId`, `criadoEm` e `atendidoEm`), mas **nenhum fluxo grava nela
hoje**: a consulta pela página "Meus dados" é só leitura e os pedidos por
e-mail ficam no controle manual do passo 2. As poucas linhas `EXPORTACAO`
que possam existir são da exportação em arquivo que saiu do sistema.

## Fora desta versão

- Tela da equipe para registrar, acompanhar e responder as solicitações
  que chegam por e-mail (hoje no controle manual do passo 2), usando a
  tabela `solicitacoes_titular` e a auditoria
  `SOLICITACAO_TITULAR_CRIADA`/`SOLICITACAO_TITULAR_ATENDIDA`, já previstas
  no código.
- Cópia dos dados, correção e anonimização feitas pelo próprio aluno na
  página "Meus dados" (hoje pelo e-mail).
- Rotina automática de anonimização de conta sem uso (ver
  `04-plano-de-retencao-e-descarte.md`).
