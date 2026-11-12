# Plano de retenção e descarte — SGEA

**Data:** 09/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Tabela no formato da seção 4.6 do guia, seguida de como cada descarte é
executado. O que ainda não está implementado aparece marcado como **plano**:
o guia não aceita prometer exclusão sem implementá-la, e a Política de
Privacidade só promete ao titular o que já funciona.

**Dois conceitos que não se confundem:**

- **Conta sem uso** — critério de retenção: 24 meses sem login (plano).
- **Conta inativada** — ação da equipe, com motivo, que bloqueia o uso do
  sistema enquanto durar e pode ser desfeita (reativação). Não apaga nada
  por si só.

## Tabela de retenção

| Categoria | Finalidade | Prazo ou critério | Destino |
|---|---|---|---|
| Cadastro aguardando confirmação (`cadastros_pendentes`) | Garantir que a conta pertence ao dono do e-mail antes de criá-la | Até 15 minutos (`expiraEm`), renovados a cada reenvio do código | **Apagado ao concluir o cadastro** (na transação que cria a conta) **ou depois de expirar**, a cada login e a cada cadastro novo. Refazer o cadastro com o mesmo e-mail ou RGM substitui o pendente anterior |
| Convite da conta da equipe (`primeiros_acessos`) | Ativar a conta do professor ou da secretaria pelo link | 24 horas, uso único | **Apagado ao ser usado** (na transação que ativa a conta). Um convite novo substitui o anterior. O convite vencido e não usado fica até o reenvio ou a exclusão da conta pendente na tela Equipe (que apaga a conta e o convite) |
| Conta ativa (`usuarios`, `participantes`) | Autenticação e participação em eventos | Enquanto ativa | — |
| Conta de aluno inativada | Bloquear o uso do sistema (uso indevido, dado incorreto, a pedido) | Até a reativação | Conta e histórico mantidos; as inscrições sem pedido de check-in em eventos que ainda não começaram são canceladas na inativação (cada uma registrada na auditoria); presenças e certificados continuam valendo; o motivo é apagado na reativação |
| Conta de professor ou de secretaria inativada | Bloquear o acesso | Até a reativação ou a exclusão | Os eventos em aberto do professor passam antes para outro professor ou para a equipe; os encerrados há mais de 24 horas continuam ligados a ele; o motivo é apagado na reativação |
| Conta da equipe excluída (tela Equipe) | — | Ao excluir | Só conta inativa ou com convite pendente, e sem histórico: sai a conta com o convite, os códigos de recuperação e os contadores de tentativa. Com histórico (eventos ou palestrantes criados, decisões de aprovação, propostas, check-ins decididos, pedidos atendidos), a conta fica inativa. Os registros de auditoria ficam (`usuarioId` nulo, `atorNome` preservado) |
| Conta excluída a pedido do titular ou pela equipe | — | Ao atender o pedido | A equipe inativa e depois remove a conta e o histórico (inscrições, avaliações e tentativas) na tela Participantes. Com certificado emitido, a remoção é recusada (`409 PARTICIPANTE_COM_CERTIFICADO`) e a conta fica só inativada |
| Conta sem uso (24 meses sem login) | — | 24 meses sem `LOGIN_SUCESSO` | **Plano:** anonimizar pela rotina de retenção |
| Inscrições, check-in e tentativas de questionário | Participação no evento e estatística | Enquanto a conta existir | Apagadas junto com a conta na remoção; a inscrição de origem de um certificado fica. Quando o prazo do check-in fecha, o pedido sem decisão vira recusado e quem não pediu fica ausente (`utils/checkin.ts`), sem apagar nada |
| Certificados emitidos (`certificados`) | Validação pública do código e prova da participação | Enquanto o certificado precisar ser verificável (nenhuma rotina apaga certificado) | Mantido. A inscrição de origem é protegida no banco (`onDelete: Restrict`) |
| Avaliações (`feedbacks`) | Avaliação do evento | Até o aluno excluir, a equipe excluir com motivo de lista fechada ou a presença do aluno ser desfeita; senão, igual às inscrições | Exclusão imediata, registrada na auditoria (`FEEDBACK_EXCLUIDO`); ao desfazer a presença, na mesma transação da mudança |
| Histórico da aprovação e propostas de alteração | Registro das decisões da equipe | Enquanto o evento ou palestrante existir | Apagados junto com o item; a proposta cancelada é apagada na hora |
| Registros do limite de tentativas (`limites_acesso`) | Bloquear adivinhação de senha e envio de códigos em massa | O bloqueio expira sozinho em 15 minutos; a linha fica com o contador zerado | **Plano:** excluir pela rotina de retenção |
| Códigos de recuperação de senha (`recuperacoes_senha`) | Confirmar a identidade na troca de senha | 15 minutos de validade | Ficam marcados como usados ou vencidos. **Plano:** excluir 24 horas depois, pela rotina |
| Registros de auditoria (`logs_auditoria`) | Segurança, investigação, exercício regular de direitos | 5 anos (art. 7º, VI da LGPD; prazo do art. 27 do CDC) | Nenhuma tela edita ou apaga. **Plano:** a rotina de retenção será a única a remover os registros com mais de 5 anos |
| Registro de aceite dos Termos/Política | Comprovar o aceite | Na conta, enquanto ela existir; na auditoria (`CONSENTIMENTO_LGPD_ACEITO`), pelo prazo dos logs | — |
| Contas e dados da carga de demonstração (`usuarios.ficticio = true`) | Mostrar o sistema com volume realista, sem dado de pessoa real | Até a próxima carga ou limpeza | O script `backend/scripts/carga-demonstracao.ts` apaga tudo antes de carregar |
| Cópia de segurança feita pela carga de demonstração (`backend/backups/backup-<data-hora>.json`) | Desfazer a carga se algo der errado | Só até confirmar que a carga deu certo | Fica só no computador de quem rodou o script, fora do repositório (`.gitignore`). **Contém todos os dados da base apagada, inclusive dados pessoais:** apagar o arquivo assim que a carga for conferida |
| Backups do banco (TiDB Cloud) | Recuperação de desastre | Backup diário (07:00 UTC), expira em 1 dia | Rotação automática do provedor |

## Como o descarte é executado

**Implementado:**

- o cadastro pendente sai na transação que cria a conta e, se expirar, é
  apagado por `apagarCadastrosExpirados()` (`auth.service.ts`), chamada a
  cada login e a cada cadastro; a chamada no login nunca impede a entrada;
- o convite da conta da equipe sai na transação que ativa a conta, ou junto
  com a conta pendente excluída na tela Equipe;
- a inativação do aluno cancela na hora as inscrições sem pedido de
  check-in em eventos futuros, cada uma registrada na auditoria;
- a exclusão de avaliação (pelo aluno ou pela equipe, com motivo) é imediata
  e auditada;
- a remoção da conta pela equipe apaga a conta e o histórico, exceto quando
  há certificado emitido;
- a expiração do check-in (`expirarCheckins`) roda antes das leituras e
  ações que dependem da presença e registra só as quantidades na auditoria.

**Plano (rotina de retenção, ainda não implementada):** uma rotina agendada
(Vercel Cron chamando uma rota protegida por segredo, ou equivalente),
idempotente, que em uma passada:

1. anonimiza as **contas sem uso** (sem login há mais de 24 meses);
2. apaga os códigos de recuperação de senha vencidos ou usados há mais de
   24 horas e os registros antigos de `limites_acesso`;
3. remove os registros de auditoria com mais de 5 anos — a única parte do
   sistema com permissão de apagar log;
4. registra na própria auditoria (`RETENCAO_EXECUTADA`) quantos registros de
   cada tipo tratou.

## Backups

Conferido no console do TiDB Cloud (Data > Backup) para este cluster: o
backup automático roda **1 vez por dia, às 07:00 UTC (04:00 de Brasília)**,
e cada backup **expira em 1 dia**. A qualquer momento existe no máximo um
backup guardado, com no máximo 24 horas de idade.

**Implicação prática:** um dado excluído no banco principal pode continuar
no backup do dia por, no máximo, 24 horas; o ciclo diário resolve isso
sozinho, sem ação manual.

**Implicação para resposta a incidentes:** só é possível restaurar o estado
das últimas 24 horas (ver `05-plano-de-resposta-a-incidentes.md`).
