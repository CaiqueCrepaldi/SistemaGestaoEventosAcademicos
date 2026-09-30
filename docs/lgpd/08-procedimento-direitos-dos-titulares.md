# Procedimento para atender aos direitos dos titulares — SGEA

**Data:** 29/09/2026 · **Versão:** 2 (exclusão do próprio feedback pelo
aluno implementada)

**Situação ao final da Fase 1:** este procedimento descreve o que a Fase 2
vai construir (página "Meus dados" + tabela de solicitações). Hoje, antes
da Fase 2, o único direito exercível tecnicamente é o acesso básico via
`GET /api/usuarios/me` — os demais dependem só do canal manual
(`privacidade@sgeacademicos.com.br`) até a página existir. Este documento
será atualizado para "implementado" item a item conforme a Fase 2 avança,
com a evidência correspondente em `10-evidencias-de-implementacao-e-testes.md`.

## Direitos cobertos (art. 18 da LGPD) e como cada um é atendido

| Direito | Como o titular exerce | Prazo de resposta |
|---|---|---|
| Confirmação da existência de tratamento e acesso aos dados | Página "Meus dados": mostra todos os dados próprios (nome, e-mail, RGM, inscrições, presenças, certificados, feedbacks, tentativas de questionário) | Imediato (tela) |
| Correção de dado incorreto ou desatualizado | Página "Meus dados": formulário de correção de nome/e-mail/RGM, com as mesmas validações do cadastro | Imediato (tela), com log de auditoria (`PARTICIPANTE_ATUALIZADO`, já existente) |
| Portabilidade | Botão "Exportar meus dados" na página "Meus dados": gera um arquivo JSON com todos os dados listados no direito de acesso | Imediato (download) |
| Anonimização/eliminação | Botão "Excluir minha conta": exige confirmação de senha, explica as consequências (ver `04-plano-de-retencao-e-descarte.md`), avisa pra baixar certificados antes, e executa a anonimização (não hard delete) | Imediato após confirmação |
| Revisão de decisão automatizada (art. 20 — liberação de certificado pelo questionário) | Botão "Pedir revisão humana" na tela onde o resultado aparece; vira uma solicitação na tabela de solicitações, atendida pela equipe | Alvo: até 15 dias corridos (mesmo prazo de referência usado pelo art. 19 da LGPD para outras solicitações, aplicado aqui por analogia) |
| Oposição ao tratamento / informação sobre compartilhamento | Formulário genérico de "Outras solicitações" na página "Meus dados", vira solicitação registrada | Até 15 dias corridos |
| Revogação de consentimento (feedback) | **Implementado:** o próprio aluno exclui o feedback dele a qualquer momento na tela Feedback (botão "Excluir", com confirmação; `DELETE /api/feedbacks/:id`), e depois pode enviar outro para o mesmo evento se quiser. Ninguém edita feedback depois de enviado; a equipe só exclui, com motivo de lista fechada. Tudo registrado na auditoria (`FEEDBACK_EXCLUIDO`) | Imediato |

## Tabela de solicitações do titular (Fase 2)

Nova entidade (`SolicitacaoTitular` ou nome equivalente), com no mínimo:

| Campo | Descrição |
|---|---|
| `id` | Identificador da solicitação |
| `participanteId` | Quem pediu (nulo se a conta já foi anonimizada depois) |
| `tipo` | `ACESSO`, `CORRECAO`, `EXPORTACAO`, `EXCLUSAO`, `REVISAO_DECISAO_AUTOMATIZADA`, `OPOSICAO`, `OUTRO` |
| `status` | `ABERTA`, `EM_ANDAMENTO`, `ATENDIDA`, `NEGADA` |
| `criadoEm` | Data/hora do pedido |
| `atendidoEm` | Data/hora da resposta |
| `atendidoPor` | Quem da equipe atendeu (para as que exigem ação humana) |
| `resposta` | Texto da resposta dada ao titular |

Acesso/exportação/correção/exclusão são resolvidos na hora, pela própria
tela (viram uma linha `ATENDIDA` automaticamente, sem depender de a equipe
entrar no meio). Revisão de decisão automatizada e oposição exigem
avaliação humana e por isso entram na fila `ABERTA` até alguém da equipe
responder pela nova tela de gestão de solicitações.

## Tela de gestão (ADMINISTRADOR/SECRETARIA)

Nova tela listando as `SolicitacaoTitular` com status `ABERTA`/`EM_ANDAMENTO`,
permitindo abrir, responder e marcar como atendida — toda ação nessa tela
também vira um evento de auditoria (`SOLICITACAO_TITULAR_ATENDIDA` ou
equivalente).

## Canal alternativo

Para quem preferir não usar a tela (ex.: já perdeu acesso à conta):
`privacidade@sgeacademicos.com.br`. Mensagens recebidas por esse canal são
registradas manualmente na mesma tabela de solicitações pela equipe, para
manter um único lugar de controle.
