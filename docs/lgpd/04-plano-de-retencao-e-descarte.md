# Plano de retenção e descarte — SGEA

**Data:** 06/11/2026 · **Versão:** 3 (cadastro aguardando confirmação do
e-mail, apagado ao concluir ou depois de 15 minutos; nota sobre a
anonimização, que saiu da Política de Privacidade versão 3. A versão 2, de
29/09/2026, separou "conta sem uso" de "aluno inativado" e incluiu as
inscrições canceladas na inativação, o feedback excluído pelo próprio aluno
e os registros do limite de tentativas)

> **Anonimização:** a Política de Privacidade versão 3 (06/11/2026) não
> promete anonimização ao titular, porque ela não existe no sistema: o que
> existe é a exclusão definitiva (ou a inativação, para quem tem
> certificado). As linhas e a rotina abaixo que falam em anonimizar ficam
> como plano, ainda não implementado.

Prazos decididos na Fase 0 (`00-diagnostico.md`, seção "Decisões tomadas").
Tabela no formato da seção 4.6 do guia, seguida de como cada descarte é
(ou será) executado tecnicamente.

**Dois conceitos que não se confundem:**

- **Conta sem uso** — critério de retenção: 24 meses sem login. Leva à
  anonimização automática (rotina ainda não implementada).
- **Aluno inativado** — ação da equipe (ADMINISTRADOR ou SECRETARIA), com
  motivo, que bloqueia o uso do sistema enquanto durar e pode ser desfeita
  (reativação). Não apaga nem anonimiza nada por si só.

No código, nas telas e nestes documentos, "inativo/inativado" se refere só
à ação da equipe; o critério de retenção é sempre chamado de "conta sem uso".

## Tabela de retenção

| Categoria | Finalidade | Prazo ou critério | Destino |
|---|---|---|---|
| Cadastro aguardando confirmação do e-mail (`cadastros_pendentes`: nome, e-mail, RGM, hash da senha, hash do código, aceite dos Termos) | Garantir que a conta pertence ao dono do e-mail institucional antes de criá-la | Até 15 minutos (`expiraEm`); renovado para 15 minutos a cada reenvio do código | **Apagado ao concluir o cadastro** (na mesma transação que cria a conta) **ou depois de expirar**: no próximo cadastro, a cada login e na tentativa de confirmar ou reenviar o código daquele e-mail. Sem rotina agendada. Preencher o cadastro de novo com o mesmo e-mail ou RGM substitui o pendente anterior |
| Conta ativa (Usuario + Participante) | Autenticação, participação em eventos | Enquanto ativa | — |
| Aluno inativado pela equipe | Bloquear o uso do sistema (ex.: uso indevido, dado incorreto, a pedido) | Até a reativação | A conta e o histórico são mantidos; as inscrições **pendentes** em eventos futuros são canceladas na inativação (liberam a vaga, cada uma registrada na auditoria); presenças e certificados continuam valendo; o motivo da inativação é apagado na reativação |
| Conta sem uso (24 meses sem login) | Autenticação | 24 meses sem login, contados a partir de `LOGIN_SUCESSO` mais recente na auditoria | Anonimizar automaticamente |
| Conta excluída a pedido do titular ou pela equipe | — | Imediato, ao confirmar o pedido | Anonimizar |
| Inscrições, presenças, certificados, tentativas de questionário | Estatística do evento (contagem, taxa de aprovação) | Enquanto a conta associada existir; sobrevivem à anonimização da conta, mas sem vínculo pessoal | Manter, desvinculado (a linha continua, mas deixa de apontar pra um nome/e-mail/RGM legível) |
| Feedbacks | Avaliação do evento/palestrante | Até o próprio aluno excluir (pode fazer isso a qualquer momento e enviar outro) ou a equipe excluir por um motivo da lista fechada; senão, igual às inscrições | Exclusão imediata, registrada na auditoria (`FEEDBACK_EXCLUIDO`); na anonimização da conta, manter a nota e **apagar** o texto do comentário |
| Registros do limite de tentativas (`limites_acesso`: conta ou IP) | Bloquear tentativa de adivinhar senha ou de disparar código em massa | O bloqueio expira sozinho em 15 min; a linha fica na tabela com o contador zerado | Excluir pela rotina automática (ainda não implementada) |
| Códigos de recuperação de senha | Confirmar identidade na troca de senha | 24h após expirar ou ser usado | Excluir |
| Logs de auditoria | Segurança, investigação, exercício regular de direitos | 5 anos a partir do registro (art. 7º, VI da LGPD; prazo do art. 27 do CDC, por ser relação de consumo aluno–UMC) | Excluir, só pela rotina automática — nunca manualmente (ver `07-medidas-tecnicas-de-seguranca.md`) |
| Registro de aceite de Termos/Política | Comprovar aceite | Mesmo prazo dos logs (5 anos) | Manter como registro pseudonimizado (data/hora + versão) após a conta ser anonimizada |
| Dados de demonstração (`[TESTE]`) | Testes acadêmicos do PFC | Até 31/12/2026 (após a apresentação) | Excluir via script de limpeza |
| Backups do banco (TiDB Cloud) | Recuperação de desastre | Backup diário (07:00 UTC), expira em 1 dia — ver "Backups" abaixo | Rotação automática do provedor, sem ação manual necessária |

## Como o descarte é executado

**Já implementado:** o cancelamento das inscrições pendentes em eventos
futuros na inativação do aluno e a exclusão do feedback (pelo próprio
aluno ou pela equipe, com motivo) — ambos imediatos e registrados na
auditoria. E o descarte do cadastro aguardando confirmação: o pendente sai
na transação que cria a conta e, se expirar, é apagado por
`apagarCadastrosExpirados()` (`auth.service.ts`), chamada no cadastro e em
todo login. A chamada no login nunca impede a entrada: se falhar, só fica
registrada no log do servidor.

**Ainda não implementado (rotina automática):** o restante desta seção
descreve o desenho que será construído (item 7 da Fase 2), não algo que já
funciona — a distinção importa porque o critério de avaliação do guia
proíbe "prometer exclusão sem implementá-la".

- **Rotina de retenção:** uma rotina agendada (Vercel Cron chamando uma
  rota protegida por segredo, ou equivalente) roda periodicamente e faz,
  em uma única passada, idempotente:
  1. Localiza **contas sem uso**: `LOGIN_SUCESSO` mais recente há mais de
     24 meses (ou nenhum login registrado e `criadoEm` há mais de 24 meses)
     e ainda não anonimizadas — independentemente de o aluno estar ou não
     inativado pela equipe.
  2. Anonimiza essas contas pelo mesmo procedimento da exclusão manual
     (ver `08-procedimento-direitos-dos-titulares.md`).
  3. Apaga códigos de recuperação de senha expirados ou usados há mais de
     24h.
  4. Verifica logs de auditoria com mais de 5 anos e os remove — **essa é
     a única rotina do sistema com permissão de apagar log**; nenhuma
     rota, service ou script fora dela pode fazer isso.
  5. Registra na própria auditoria (`RETENCAO_EXECUTADA` ou equivalente)
     quantos registros de cada tipo foram tratados naquela execução — a
     rotina se audita a si mesma.
- **Idempotência:** rodar a rotina duas vezes seguidas no mesmo dia não
  deve alterar nada na segunda vez além do que já foi feito na primeira —
  cada critério é uma consulta que já exclui quem já foi tratado (conta já
  anonimizada não entra de novo no filtro, por exemplo).
- **Script de limpeza dos dados de demonstração:** script avulso (mesmo
  padrão dos scripts em `backend/scripts/`), que localiza tudo com o
  prefixo `[TESTE]`/`Teste` criado pelo lote de demonstração e remove via
  API ou diretamente pelas mesmas regras de negócio do sistema — a ser
  rodado uma vez, manualmente, antes de 31/12/2026.

## Backups

Confirmado no console do TiDB Cloud (Data > Backup) para este cluster
específico: o backup automático roda **1 vez por dia, às 07:00 UTC (04:00
de Brasília)**, e cada backup **expira em 1 dia**. Ou seja, a qualquer
momento existe no máximo um backup guardado, com no máximo 24 horas de
idade.

**Implicação prática:** um dado anonimizado ou excluído no banco principal
pode continuar existindo dentro do backup do dia por, no máximo, 24 horas
— depois disso, o próprio ciclo diário substitui aquele backup por um novo
(que já não vai mais ter o dado, porque a anonimização já tinha acontecido
no banco principal antes daquele backup ser tirado). Não é preciso nenhuma
ação manual pra "limpar" o backup — o prazo máximo de 24h já resolve
sozinho, pela rotação diária.

**Implicação para resposta a incidentes:** só é possível restaurar o
estado das últimas 24 horas. Um problema percebido depois desse prazo não
tem backup correspondente pra recuperação — ver a limitação registrada em
`05-plano-de-resposta-a-incidentes.md`.
