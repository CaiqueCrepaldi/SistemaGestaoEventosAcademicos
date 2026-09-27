# Plano de retenção e descarte — SGEA

**Data:** 27/09/2026 · **Versão:** 1

Prazos decididos na Fase 0 (`00-diagnostico.md`, seção "Decisões tomadas").
Tabela no formato da seção 4.6 do guia, seguida de como cada descarte é
(ou será) executado tecnicamente.

## Tabela de retenção

| Categoria | Finalidade | Prazo ou critério | Destino |
|---|---|---|---|
| Conta ativa (Usuario + Participante) | Autenticação, participação em eventos | Enquanto ativa | — |
| Conta sem login há 24 meses | Autenticação | 24 meses sem login, contados a partir de `LOGIN_SUCESSO` mais recente na auditoria | Anonimizar automaticamente |
| Conta excluída a pedido do titular ou pela equipe | — | Imediato, ao confirmar o pedido | Anonimizar |
| Inscrições, presenças, certificados, tentativas de questionário | Estatística do evento (contagem, taxa de aprovação) | Enquanto a conta associada existir; sobrevivem à anonimização da conta, mas sem vínculo pessoal | Manter, desvinculado (a linha continua, mas deixa de apontar pra um nome/e-mail/RGM legível) |
| Feedbacks | Avaliação do evento/palestrante | Igual às inscrições | Manter a nota; **apagar** o texto do comentário na anonimização da conta |
| Códigos de recuperação de senha | Confirmar identidade na troca de senha | 24h após expirar ou ser usado | Excluir |
| Logs de auditoria | Segurança, investigação, exercício regular de direitos | 5 anos a partir do registro (art. 7º, VI da LGPD; prazo do art. 27 do CDC, por ser relação de consumo aluno–UMC) | Excluir, só pela rotina automática — nunca manualmente (ver `07-medidas-tecnicas-de-seguranca.md`) |
| Registro de aceite de Termos/Política | Comprovar aceite | Mesmo prazo dos logs (5 anos) | Manter como registro pseudonimizado (data/hora + versão) após a conta ser anonimizada |
| Dados de demonstração (`[TESTE]`) | Testes acadêmicos do PFC | Até 31/12/2026 (após a apresentação) | Excluir via script de limpeza |
| Backups do banco (TiDB Cloud) | Recuperação de desastre | Ver seção "Backups" abaixo | Rotação automática do provedor |

## Como o descarte é executado

**Situação no momento deste documento (fim da Fase 1): nada disto está
implementado ainda.** A implementação é o item 7 da Fase 2. Esta seção
descreve o desenho que será construído, não algo que já funciona — a
distinção importa porque o critério de avaliação do guia proíbe "prometer
exclusão sem implementá-la".

- **Rotina de retenção:** uma rotina agendada (Vercel Cron chamando uma
  rota protegida por segredo, ou equivalente) roda periodicamente e faz,
  em uma única passada, idempotente:
  1. Localiza contas com `LOGIN_SUCESSO` mais recente há mais de 24 meses
     (ou nenhum login registrado e `criadoEm` há mais de 24 meses) e ainda
     não anonimizadas.
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

O TiDB Cloud (Serverless) mantém backups automáticos geridos pelo próprio
provedor, fora do controle do código da aplicação. **Isto precisa ser
confirmado no painel/documentação oficial do TiDB Cloud pra este cluster
específico antes da entrega final** — a informação abaixo é a política
publicamente documentada pela TiDB Cloud para o tier Serverless no momento
da escrita deste documento e deve ser revalidada:

> No plano padrão do TiDB Cloud Serverless, backups automáticos são
> mantidos por um período determinado pelo provedor (histórico de poucos
> dias no tier gratuito/serverless), com retenção maior disponível em
> planos superiores. Ou seja, um dado anonimizado ou excluído no banco
> principal **pode continuar existindo dentro de um backup já feito** até
> que esse backup específico seja rotacionado (descartado) pelo próprio
> ciclo do provedor.

**Implicação para a Política de Privacidade:** o texto da política (v2)
precisa deixar isso explícito — anonimização/exclusão são imediatas no
banco em uso, mas cópias de segurança anteriores àquele momento só saem de
circulação quando o provedor as rotaciona, não instantaneamente. Isso é
exatamente o tipo de limitação que o guia pede pra não prometer o que não
se controla ("o sistema precisa implementar o descarte prometido, inclusive
para arquivos e cópias de segurança" — o SGEA não controla o ciclo de
backup do TiDB Cloud, por isso a política declara o limite em vez de
prometer algo que não pode garantir).

**Ação pendente:** confirmar no painel do TiDB Cloud (ou com o suporte) o
prazo exato de retenção de backup deste cluster específico, e atualizar
este documento e a política v2 com o número real antes da entrega final do
PFC.
