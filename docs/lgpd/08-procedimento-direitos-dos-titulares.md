# Procedimento para atender aos direitos dos titulares — SGEA

**Data:** 04/11/2026 · **Versão:** 3 (RF026 em versão enxuta: página "Meus
dados" para ver e exportar; demais direitos atendidos manualmente pelo
e-mail de privacidade)

**Situação atual:** o titular (aluno) exerce sozinho, dentro do sistema, o
**acesso** e a **portabilidade** pela página "Meus dados". Todos os outros
direitos chegam pelo e-mail `privacidade@sgeacademicos.com.br` e são
atendidos manualmente pela equipe, com resposta em **até 15 dias corridos**.
Não existe ainda tela da equipe para registrar e acompanhar esses pedidos
(ver "Fora desta versão", no fim).

## Direitos cobertos (art. 18 da LGPD) e como cada um é atendido

| Direito | Como o titular exerce | Como a equipe atende | Prazo |
|---|---|---|---|
| Confirmação da existência de tratamento e acesso aos dados | **No sistema:** página "Meus dados" (`GET /api/meus-dados`) — dados cadastrais (nome, e-mail, RGM, data do cadastro, data e versão do aceite dos termos, situação do 2FA), inscrições e presenças, resultados dos questionários (acertos e percentual, sem gabarito nem respostas), certificados e avaliações | Nada a fazer. Se a pessoa não consegue entrar no sistema, ela pede por e-mail (ver "Atendimento pelo e-mail", passo 4) | Imediato (tela) |
| Portabilidade | **No sistema:** botão "Baixar meus dados (JSON)" (`GET /api/meus-dados/exportacao`), arquivo `meus-dados-sgea.json` com o mesmo conteúdo da tela | Nada a fazer: o pedido já nasce atendido — o sistema grava uma `SolicitacaoTitular` (`EXPORTACAO`, `ATENDIDA`) e a auditoria `DADOS_EXPORTADOS` | Imediato (download) |
| Correção de dado incorreto ou desatualizado | E-mail para `privacidade@sgeacademicos.com.br` (botão "Enviar pedido por e-mail" na página "Meus dados", com o RGM já no corpo) | Corrige nome, e-mail ou RGM na tela **Participantes** (vale também para a conta de login do aluno); fica na auditoria (`PARTICIPANTE_ATUALIZADO`, só com os nomes dos campos) | Até 15 dias |
| Anonimização ou eliminação | E-mail | Inativa o aluno na tela **Participantes** (derruba as sessões e cancela as inscrições pendentes de eventos futuros) e depois exclui. **Exceção:** aluno com certificado emitido não pode ser excluído (`409 PARTICIPANTE_COM_CERTIFICADO`) — a conta fica inativada e o registro do certificado é mantido, porque comprova a participação; isso é explicado na resposta e na Política (seção 7 do texto da página do sistema). A anonimização automática ainda não existe | Até 15 dias |
| Revisão de decisão automatizada (art. 20 — o questionário corrigido pelo sistema libera o certificado) | E-mail. Na tela **Certificados**, o evento em que o aluno ficou abaixo de 60% nas duas tentativas mostra o link "Pedir revisão do resultado", que abre o e-mail com o assunto "Revisão do resultado do questionário – {evento}" e o RGM | Uma pessoa da equipe confere as respostas da tentativa contra o gabarito do evento e responde explicando o resultado. Não existe tela para alterar o resultado: se a revisão der razão ao aluno (ex.: gabarito errado), a correção é feita pela equipe técnica e registrada na resposta | Até 15 dias |
| Oposição ao tratamento / informação sobre compartilhamento | E-mail | Responde com base na Política de Privacidade (operadores: Vercel, TiDB Cloud, SendGrid) e avalia o pedido de oposição caso a caso | Até 15 dias |
| Revogação de consentimento (feedback) | **No sistema:** o próprio aluno exclui o feedback dele a qualquer momento na tela Feedback (botão "Excluir", com confirmação; `DELETE /api/feedbacks/:id`) e pode enviar outro para o mesmo evento. Ninguém edita feedback depois de enviado | Nada a fazer. A equipe só exclui feedback com motivo de lista fechada; tudo fica na auditoria (`FEEDBACK_EXCLUIDO`) | Imediato |

## Atendimento pelo e-mail

1. **Conferir a identidade.** O pedido precisa vir do e-mail institucional
   cadastrado na conta (o mesmo do login). O RGM que vem no corpo da
   mensagem (os botões do sistema já preenchem) ajuda a achar o cadastro na
   tela Participantes. Se o e-mail de origem for outro, pedir a confirmação
   pelo e-mail cadastrado antes de agir.
2. **Registrar o pedido** no controle da equipe: data de recebimento, tipo
   (correção, exclusão, revisão, oposição, outro), prazo final (recebimento
   + 15 dias) e, depois, a data e o resumo da resposta. O controle não pode
   guardar mais dado pessoal que o necessário (o RGM basta para localizar
   a pessoa).
3. **Atender** conforme a tabela acima. Toda alteração feita pelas telas
   do sistema já fica na trilha de auditoria.
4. **Responder** ao titular pelo mesmo e-mail, dentro do prazo, dizendo o
   que foi feito ou, se o pedido for negado (total ou parcialmente), o
   motivo. Pedido de cópia dos dados por quem não consegue entrar no
   sistema: primeiro orientar a recuperar o acesso ("Esqueci a senha", ou
   desbloqueio da conta pelo administrador na tela Participantes) para a
   própria pessoa usar a página "Meus dados". Se não for possível (ex.:
   conta inativada), a equipe monta o mesmo conteúdo a partir das telas de
   gestão (Participantes, Inscrições, Check-in, Certificados e Feedback) —
   o sistema não gera a exportação de outra pessoa.

## Tabela de solicitações (`solicitacoes_titular`)

A tabela já existe no banco e é reaproveitada sem mudança de schema:

| Campo | Uso hoje |
|---|---|
| `id` | Identificador da solicitação (é o que a auditoria grava) |
| `participanteId` | Quem pediu (apagado junto com o participante) |
| `tipo` | `EXPORTACAO` — o único tipo gravado hoje |
| `status` | `ATENDIDA` (a exportação é entregue na hora) |
| `descricao` / `resposta` | Texto fixo, sem dado pessoal: "Exportação dos próprios dados pela página Meus dados" / "Arquivo JSON gerado e baixado na hora" |
| `criadoEm` / `atendidoEm` | Instante do pedido e da entrega (iguais na exportação) |
| `atendidoPorId` | Nulo: ninguém da equipe precisou agir |

A consulta pela tela (`GET /api/meus-dados`) não grava solicitação nem log:
é só leitura dos próprios dados.

## Fora desta versão

- Tela da equipe para registrar, acompanhar e responder as solicitações
  que chegam por e-mail (hoje no controle manual do passo 2), com a
  auditoria `SOLICITACAO_TITULAR_CRIADA`/`SOLICITACAO_TITULAR_ATENDIDA`, já
  prevista no código.
- Correção de dados e anonimização feitas pelo próprio aluno na página
  "Meus dados" (hoje pelo e-mail).
- Rotina automática de anonimização de conta sem uso (ver
  `04-plano-de-retencao-e-descarte.md`).
