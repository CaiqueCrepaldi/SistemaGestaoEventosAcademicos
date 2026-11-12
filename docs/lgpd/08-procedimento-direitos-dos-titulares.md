# Procedimento para atender aos direitos dos titulares — SGEA

**Data:** 09/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

**Como funciona hoje:** o aluno exerce sozinho, dentro do sistema, o
**acesso** (página "Meus dados") e a retirada do consentimento da avaliação
(excluindo a própria). Todos os outros direitos —
inclusive receber uma cópia dos dados (portabilidade) — chegam pelo e-mail
`privacidade@sgeacademicos.com.br` e são atendidos manualmente pela equipe,
com resposta em **até 15 dias corridos**. Não existe tela da equipe para
registrar e acompanhar esses pedidos (ver "Fora desta versão", no fim).

## Direitos cobertos (art. 18 da LGPD) e como cada um é atendido

| Direito | Como o titular exerce | Como a equipe atende | Prazo |
|---|---|---|---|
| Confirmação da existência de tratamento e acesso aos dados | **No sistema:** página "Meus dados" (`GET /api/meus-dados`) — dados cadastrais (nome, e-mail, RGM, data do cadastro, data e versão do aceite dos termos, situação do 2FA), inscrições e check-in (situação, hora do pedido e da decisão), resultados dos questionários (acertos e percentual, sem gabarito nem respostas), certificados e avaliações | Nada a fazer. Se a pessoa não consegue entrar no sistema, ela pede por e-mail (ver "Atendimento pelo e-mail", passo 4) | Imediato (tela) |
| Portabilidade (cópia dos dados para levar a outro serviço) | E-mail | Monta a cópia com o mesmo conteúdo da página "Meus dados", a partir das telas de gestão (Participantes, Inscrições, Certificados e Feedback), e envia ao titular pelo e-mail cadastrado. O sistema não gera essa cópia sozinho | Até 15 dias |
| Correção de dado incorreto ou desatualizado | E-mail | Corrige **nome ou RGM** na tela **Participantes** (o nome vale também para a conta de login do aluno); fica na auditoria (`PARTICIPANTE_ATUALIZADO`, só com os nomes dos campos). O **e-mail não pode ser alterado** (a tela mostra só para leitura e a API recusa com `422`): ele é o login, confirmado por código no cadastro. Mudança de e-mail institucional segue o procedimento abaixo | Até 15 dias |
| Eliminação | E-mail | Inativa o aluno na tela **Participantes** (derruba as sessões e cancela as inscrições sem pedido de check-in em eventos futuros) e depois remove: a conta de acesso, o participante (RGM), as inscrições, os feedbacks e as tentativas de questionário são apagados de vez (auditoria `PARTICIPANTE_REMOVIDO`, só com as contagens). Continuam só os registros de auditoria, pelo prazo dos logs (com a cópia do nome de quem agiu, `atorNome`). **Exceção:** aluno com certificado emitido não pode ser removido (`409 PARTICIPANTE_COM_CERTIFICADO`) — a conta fica só inativada, sem acesso, e o certificado (com a cópia do nome e do RGM) é mantido, porque precisa continuar verificável pelo código; isso é explicado na resposta e na Política (seção 7). O sistema não faz anonimização; ela fica como plano em `04` | Até 15 dias |
| Revisão de decisão automatizada (art. 20 — o questionário corrigido pelo sistema libera o certificado) | E-mail (não há atalho na tela) | Uma pessoa da equipe confere as respostas da tentativa contra o gabarito do evento e responde explicando o resultado. A revisão só verifica se a correção automática está certa: **não é uma nova tentativa** — o aluno tem 2 tentativas e, se não atingir 60% em nenhuma, não recebe o certificado daquele evento. Não existe tela para alterar o resultado: se a revisão encontrar erro do sistema (ex.: gabarito errado), a correção é feita pela equipe técnica e registrada na resposta | Até 15 dias |
| Oposição ao tratamento / informação sobre compartilhamento | E-mail | Responde com base na Política de Privacidade (operadores: Vercel, TiDB Cloud, SendGrid) e avalia o pedido de oposição caso a caso | Até 15 dias |
| Revogação de consentimento (avaliação da palestra) | **No sistema:** o próprio aluno exclui a avaliação dele a qualquer momento na tela Feedback (botão "Excluir", com confirmação; `DELETE /api/feedbacks/:id`) e pode enviar outro para o mesmo evento. Ninguém edita feedback depois de enviado | Nada a fazer. A equipe só exclui feedback com motivo de lista fechada; tudo fica na auditoria (`FEEDBACK_EXCLUIDO`) | Imediato |

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

## Professores, secretarias e palestrantes

Professores, secretarias e palestrantes também são titulares e fazem os
pedidos pelo mesmo e-mail. A equipe corrige nome e e-mail do palestrante na
tela Palestrantes. A tela Equipe não edita nome nem e-mail: a correção do
nome é feita pela equipe técnica. A conta de professor ou de secretaria pode
ser inativada na tela Equipe (o professor, com a transferência dos eventos
em aberto). A exclusão, na mesma tela, só vale para conta inativa ou que
ainda não usou o convite; quem tem histórico no sistema (eventos ou
palestrantes criados, decisões de aprovação, propostas, check-ins decididos,
pedidos atendidos) fica preservado como inativo, e os registros de
auditoria nunca são apagados.

## Mudança do e-mail institucional

O e-mail do aluno não é editável no sistema, nem pela equipe: é a
identificação de acesso, confirmada por código no cadastro, e trocá-lo por
um endereço não confirmado entregaria a conta (e os certificados) a quem
controla o endereço novo. Quando o aluno informa que o e-mail institucional
mudou, a equipe analisa o caso:

1. **Conferir a identidade** pelo RGM e, se ainda for possível, por uma
   resposta enviada do e-mail antigo. Confirmar também o e-mail novo,
   escrevendo para ele e esperando a resposta (é o equivalente manual do
   código do cadastro). O e-mail novo precisa terminar em `@alunos.umc.br`.
2. **Aluno sem certificado emitido:** inativar e excluir a conta antiga na
   tela Participantes; o aluno faz um cadastro novo com o e-mail novo (o RGM
   fica livre com a exclusão). Inscrições da conta antiga não passam para a
   nova.
3. **Aluno com certificado emitido** (a conta não pode ser excluída): a
   troca do `usuarios.emailLogin` é feita pela equipe técnica direto no
   banco, depois das confirmações do passo 1, e registrada na resposta ao
   titular. Os certificados já emitidos não mudam (guardam o nome e o RGM,
   não o e-mail).
4. **Responder** ao aluno pelo e-mail novo, dentro de 15 dias.

## Tabela de solicitações (`solicitacoes_titular`)

A tabela existe no banco (com `tipo`, `status`, `descricao`, `resposta`,
`atendidoPorId`, `criadoEm` e `atendidoEm`), mas **nenhum fluxo grava nela
hoje**: a consulta pela página "Meus dados" é só leitura e os pedidos por
e-mail ficam no controle manual do passo 2. As poucas linhas `EXPORTACAO`
que possam existir são de uma exportação em arquivo que não existe mais.

## Fora desta versão

- Tela da equipe para registrar, acompanhar e responder as solicitações
  que chegam por e-mail (hoje no controle manual do passo 2), usando a
  tabela `solicitacoes_titular` e a auditoria
  `SOLICITACAO_TITULAR_CRIADA`/`SOLICITACAO_TITULAR_ATENDIDA`, já previstas
  no código.
- Cópia dos dados e correção de nome/RGM feitas pelo próprio aluno na
  página "Meus dados" (hoje pelo e-mail).
- Anonimização (de conta sem uso ou a pedido): não existe no sistema e não
  é oferecida na Política de Privacidade; o plano está em
  `04-plano-de-retencao-e-descarte.md`.
