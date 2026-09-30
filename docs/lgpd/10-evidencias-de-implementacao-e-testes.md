# Evidências de implementação e testes — SGEA

**Data:** 29/09/2026 · **Versão:** 3 (hash de senha com custo 12, inativação
padronizada, feedback sem edição, campos obrigatórios nos formulários, 2FA
opcional, nome/e-mail/RGM sem criptografia; a versão 2, de 28/09/2026,
cobria até o 2FA obrigatório para a equipe)

Para cada controle, onde está no código, como foi testado e o resultado.
Controles que ainda não existem aparecem como "pendente" — não têm
evidência aqui até serem implementados e testados de verdade, conforme a
regra deste trabalho de nunca prometer o que não está implementado. A
verificação de todos os requisitos funcionais, com o que foi corrigido em
cada um, está em `docs/verificacao-de-requisitos.md`.

## Testes automatizados (todos no banco de desenvolvimento `SGEA_dev`)

| Teste | Comando | Resultado em 29/09/2026 |
|---|---|---|
| Requisitos pela API (inclui os itens B, C, D, F e G) | `cd backend && npx tsx scripts/testar-requisitos.ts` | **123/123** verificações |
| 2FA pela API | `cd backend && npx tsx scripts/testar-2fa.ts` | **53/53** |
| Interface com navegador de verdade (Chrome) | passo a passo no topo de `frontend/testes-interface/testar-interface.mjs` | **60/60** |
| Demonstração do hash de senha | `cd backend && npx tsx scripts/demonstrar-hash-senha.ts` | ver `07-medidas-tecnicas-de-seguranca.md`, seção "Formato do hash de senha" |

Os scripts se recusam a rodar se o `DATABASE_URL` não for o `SGEA_dev`,
criam os próprios dados e apagam no final.

## Controles já implementados

| Controle | Onde no código | Como foi testado | Resultado |
|---|---|---|---|
| Autorização por perfil em toda rota | `backend/src/middleware/auth.ts` + todas as `*.routes.ts` | `testar-requisitos.ts` R04: aluno em rotas da equipe (participantes, salas, auditoria, tentativas de todos, usuários) → `403`; sem token → `401`. Sessões anteriores do projeto: aluno acessando participante/feedback de outro aluno pelo id → `403`/dado filtrado | Confirmado |
| `participanteId` sempre do token, nunca do corpo | `feedbacks.routes.ts`, `eventos.routes.ts` (autoinscrição), `inscricoes.routes.ts` | R08 e R14: aluno envia o `participanteId` de outro aluno no corpo → o registro usa o do token; R10: parâmetro forjado na URL é ignorado | Confirmado |
| Hash de senha bcrypt, custo 12, salt por senha, rehash no login | `utils/password.ts`, `auth.service.ts` (`login`) | R20: conta com hash de custo 10 entra e o hash vira custo 12 sem trocar a senha, a senha continua valendo e o rehash fica na auditoria (`SENHA_HASH_ATUALIZADO`); duas contas com a mesma senha têm salts e hashes diferentes. `demonstrar-hash-senha.ts` mostra o hash do banco de dev decomposto (versão, custo, salt, hash) | Confirmado |
| Nome/e-mail/RGM em texto puro, sem quebrar os registros antigos | `utils/dadosPessoais.ts`, `auth.service.ts`, `participantes.service.ts`, `utils/auditoria.ts` | R24: cadastro novo grava nome/e-mail/RGM em texto puro no banco e a senha continua só como hash; conta ainda no formato antigo (cifrado) é lida normalmente; log novo guarda o nome do responsável em texto (`atorNome`) | Confirmado |
| Conversão dos registros antigos | `backend/scripts/converter-dados-pessoais.ts` | No dev: simulação (3 usuários, 3 participantes e 98 logs a converter; 0 falhas; 0 índices divergentes), aplicação, e segunda aplicação sem nada a converter (idempotente); depois disso as três suítes rodaram de novo sem falha. Em produção só aplica com `--confirmo-exportacao` (recusou sem ele) | Confirmado no dev; em produção depende de confirmação |
| Criptografia só do que é credencial | `utils/criptografia.ts`, `mfa.service.ts` | `testar-2fa.ts`: segredo do 2FA gravado cifrado (não aparece em texto puro no banco) | Confirmado |
| Inativação padronizada | `participantes.service.ts`, `auth.service.ts`, `inscricoes.service.ts`, `eventos.service.ts`, `questionario.service.ts` | R16: inativar sem motivo → `422`; aluno não inativa ninguém (`403`); a sessão aberta do aluno cai; login → `403 CONTA_INATIVA` "Sua conta está inativa. Procure a secretaria.", sem o motivo; inscrição pendente em evento futuro cancelada e registrada (`INSCRICAO_CANCELADA`); inscrição com presença e de evento passado mantidas; equipe não inscreve nem faz check-in do inativo (`409`); reativar apaga o motivo, audita e libera o login. Interface: mensagem no login, badge "Inativo" em Participantes, Inscrições e Usuários | Confirmado |
| Feedback sem edição; exclusão pelo aluno ou pela equipe com motivo | `feedbacks.routes.ts`, `feedbacks.service.ts` | R22: `PUT` → `403` para aluno e equipe (conteúdo intacto); equipe não cria feedback em nome de aluno (`403`); aluno não exclui o de outro (`403`); aluno exclui o próprio, o evento volta a ficar disponível e ele envia outro; equipe sem motivo → `422` no campo `motivo`, motivo fora da lista → `422`, com motivo → `204`; `FEEDBACK_EXCLUIDO` diz quem excluiu e o motivo. Interface: sem botão de editar, confirmação antes de excluir, equipe sem "Novo feedback" | Confirmado |
| Feedback só com certificado, um por evento | `feedbacks.service.ts`, índice único `(participanteId, eventoId)` | R14: sem certificado → `403`; segundo feedback → `409`; nota fora de 1–5 → `422` | Confirmado |
| Questionário só com presença confirmada | `questionario.service.ts` (`responder`) | R13: aluno sem presença confirmada no evento → `403` (antes a tentativa era aceita) | Confirmado (corrigido nesta rodada) |
| 2FA opcional para todos | `modules/mfa/`, `middleware/auth.ts` | `testar-2fa.ts`: secretaria e administrador sem 2FA entram direto; sessão de equipe sem 2FA não é mais recusada; secretaria ativa por vontade própria e passa a ter o login em duas etapas; administrador desativa o próprio 2FA com senha + código. Interface: equipe entra sem tela de QR code; "Minha conta" oferece ativar | Confirmado |
| 2FA: segredo, QR no servidor, códigos de recuperação, reuso, bloqueio, reset | `modules/mfa/`, `usuarios.routes.ts`, `scripts/resetar-2fa.ts` | `testar-2fa.ts` (53 verificações): QR em PNG gerado no servidor; mesmo segredo antes de confirmar; 8 códigos de recuperação só em hash, cada um uma vez; token "2FA pendente" recusado em outras rotas; reuso do código na mesma janela recusado; 5 erros → `429`; reset pelo administrador e pelo script de emergência, com auditoria; nenhum segredo nem código nos logs | Confirmado |
| Campos obrigatórios e erros de validação nos formulários | `frontend/src/components/ui/Campo.tsx`, `frontend/src/hooks/useErrosFormulario.ts` e cada página | Interface: login, cadastro, esqueci a senha, salas, palestrantes, eventos (com erro por pergunta do questionário), inscrições, feedback, exclusão de feedback, questionário, inativação e 2FA — enviar com algo faltando marca o campo, mostra a mensagem embaixo e foca o primeiro inválido; e-mail duplicado vindo do backend aparece embaixo do campo e-mail; R01: o `422` do backend traz o campo | Confirmado |
| Limite de tentativas de login e de recuperação (conta e IP) | `utils/limiteAcesso.ts`, `auth.service.ts`, tabela `limites_acesso` | Teste do bloco 2 (39/39): bloqueio por conta e por IP isolados, mensagem idêntica para senha errada/conta inexistente/conta bloqueada, expiração sozinha, desbloqueio manual só por ADMINISTRADOR com auditoria | Confirmado |
| Invalidação de sessão | `middleware/auth.ts`, `usuarios.versaoToken` | R16 e R17: token antigo → `401` depois da inativação e da troca de senha; `testar-2fa.ts`: idem depois de desativar e de resetar o 2FA | Confirmado |
| Senha nunca em texto puro | `password.ts` (bcrypt) | R24: o valor gravado é um hash `$2a$12$…`, diferente da senha | Confirmado |
| Trilha de auditoria | `utils/auditoria.ts` chamado em cada `*.service.ts` de escrita | R18: filtros por ação e responsável; parâmetro inválido → `422`; lista de responsáveis. Interface: filtro por "Feedback excluído" mostra o responsável e o motivo | Confirmado |
| Log nunca contém dado sensível no `detalhe` | Todos os `registrarAuditoria(...)` | R18: nenhum log do teste contém e-mail, RGM, senha, código, comentário de feedback, nome editado ou motivo de inativação; `testar-2fa.ts`: nenhum segredo nem código | Confirmado, 0 vazamentos |
| Aceite de Termos/Política obrigatório e datado pelo servidor | `auth.schemas.ts` (`z.literal(true)`), `auth.service.ts` | R01: cadastro sem aceite → `422`; com aceite → `201`, com data/hora e versão dos Termos gravadas | Confirmado |
| Minimização: telefone do palestrante removido; e-mail do palestrante fora da resposta para ALUNO | `schema.prisma`, `utils/dto.ts`, `palestrantes.routes.ts` | R06: aluno recebe só `id` e `nome`; equipe recebe o e-mail | Confirmado |
| Cabeçalhos de segurança e limite de corpo | `expressApp.ts`, `errorHandler.ts` | Requisição local (28/09/2026): sem `X-Powered-By`; CSP, HSTS, `X-Content-Type-Options` e `X-Frame-Options` presentes; corpo de 300 kb → `413` | Confirmado |
| Separação de ambientes | `backend/.env` → `SGEA_dev`; `.env.production.local` só para migration e scripts com `--producao` | Todos os testes desta versão rodaram no `SGEA_dev` e se recusam a rodar em outro banco | Confirmado |
| Sem serviço externo além dos três documentados | `frontend/index.html`, `package.json` (frontend e backend) | Inspeção de todo import/script/dependência; as bibliotecas do 2FA (`otplib`, `qrcode`) rodam localmente; o Playwright dos testes de interface fica numa pasta própria, fora do build | Confirmado |
| Nenhuma migration destrutiva aplicada sem confirmação prévia | Processo de trabalho deste PFC | Todas as migrations foram mostradas antes de aplicar em produção | Confirmado, histórico em `backend/prisma/migrations/` |

## Controles pendentes — sem evidência ainda

| Controle | Onde vai ficar | Como será testado (planejado) |
|---|---|---|
| Conversão dos dados pessoais em produção e retirada do código de leitura em dois formatos | `scripts/converter-dados-pessoais.ts --producao`, depois a segunda implantação | Simulação e aplicação em produção mostrando só contagens; depois, busca e unicidade direto nas colunas |
| Reaceite de Termos/Política quando a versão muda | Falta a tela que pede o novo aceite (o backend já grava a versão e tem a rota) | Mudar a versão vigente e confirmar que o próximo login pede o aceite e registra `TERMOS_REACEITOS` |
| Página "Meus dados" (acesso, correção, exportação, exclusão, revisão de decisão automatizada) | Novo módulo frontend + backend | Teste de cada ação, incluindo exportação (JSON com todos os campos esperados e nenhum a mais) |
| Anonimização em vez de exclusão definitiva | `participantes.service.ts` | Após excluir, nome/e-mail/RGM não identificam mais a pessoa; inscrições/certificados continuam sem vínculo pessoal; comentário de feedback apagado, nota mantida |
| Rotina de retenção automática (conta sem uso há 24 meses, códigos expirados, logs de 5 anos, registros de limite por IP) | Rota protegida + agendamento | Rodar duas vezes seguidas sem repetir ação (idempotência); cada critério com dado fabricado no banco de teste |
| Script de limpeza dos dados de demonstração | `backend/scripts/` | Rodar e confirmar que o lote de demonstração some do banco |
