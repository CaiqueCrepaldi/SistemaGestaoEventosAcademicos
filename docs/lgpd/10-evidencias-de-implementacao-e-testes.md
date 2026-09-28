# Evidências de implementação e testes — SGEA

**Data:** 28/09/2026 · **Versão:** 2 (inclui os controles da Fase 2 já
implementados: minimização, cabeçalhos de segurança, limite de tentativas,
invalidação de sessão e autenticação em dois fatores)

Para cada controle, onde está no código, como foi testado e o resultado.
Controles que ainda não existem aparecem como "pendente" — não têm
evidência aqui até serem implementados e testados de verdade, conforme a
regra deste trabalho de nunca prometer o que não está implementado.

## Controles já implementados

| Controle | Onde no código | Como foi testado | Resultado |
|---|---|---|---|
| Autorização por perfil em toda rota | `backend/src/middleware/auth.ts` + todas as `*.routes.ts` | Testes end-to-end contra banco MySQL local descartável (sessões anteriores deste projeto): aluno chamando rota de administrador → `403`; aluno acessando participante/feedback de outro aluno pelo id → `403`/dado filtrado | Confirmado — nenhuma rota deixou passar |
| `participanteId` sempre do token, nunca do corpo (feedback/inscrição) | `feedbacks.routes.ts`, `eventos.routes.ts` (autoinscrição) | Teste automatizado: aluno A envia `participanteId` do aluno B no corpo do `POST /feedbacks` → o feedback criado registra o `participanteId` do token (aluno A), não o do corpo | Confirmado |
| Feedback só com certificado (presença + nota mínima) | `feedbacks.service.ts` (`validarDireitoAoCertificado`), reaproveitando `utils/certificado.ts`/`utils/questionario.ts` | Testes automatizados com alunos em 4 cenários (sem questionário, reprovado, presença pendente, sem inscrição) → todos `403` com a mensagem exata; aluno aprovado → `201` | Confirmado, 0 falhas em 46 verificações |
| Um feedback por aluno por evento | Índice único `(participanteId, eventoId)` em `feedbacks`, checado antes de criar | Segunda tentativa de avaliar o mesmo evento → `409` | Confirmado |
| Cifra de nome/e-mail/RGM em repouso | `backend/src/utils/criptografia.ts` (AES-256-GCM + índice HMAC) | Backfill e migração em duas fases testados com verificação de decriptação em 100% das linhas antes/depois; login segue funcionando após a migração | Confirmado, na migração original desta funcionalidade |
| Senha nunca em texto puro | `password.ts` (bcrypt) | Inspeção direta do valor gravado no banco (só o hash aparece) | Confirmado |
| Trilha de auditoria cobre toda escrita | `utils/auditoria.ts` chamado em cada `*.service.ts` de escrita | Varredura de todo `prisma.*.create/update/delete/upsert` em `backend/src`, uma por uma, confirmando log correspondente (feita na tarefa que ampliou a auditoria) | Confirmado — a única escrita sem log correspondente é a própria escrita do log |
| Log nunca contém dado sensível no `detalhe` | Todos os `registrarAuditoria(...)` do código | Varredura automatizada: nenhum dos ~40 logs gerados num teste completo do sistema continha e-mail, nome, senha, código, RGM ou token no campo `detalhe`; repetida no teste do 2FA (nenhum log contém segredo TOTP nem código de recuperação) | Confirmado, 0 vazamentos |
| Log sobrevive à exclusão do usuário, com cópia do nome | `LogAuditoria.atorNomeCifrado`, relação `onDelete: SetNull` | Teste automatizado: cria log, exclui o usuário, confere que o total de logs não muda, `usuarioId` vira nulo e `atorNomeCifrado` continua decifrável pro nome correto | Confirmado |
| Recuperação de senha com hash + limite de tentativas | `auth.service.ts` | Testes automatizados: código errado incrementa tentativa; 5 erros bloqueia mesmo o código certo depois; reuso do código já usado é barrado | Confirmado |
| Aceite de Termos/Política obrigatório e datado pelo servidor | `auth.schemas.ts` (`z.literal(true)`), `auth.service.ts` | Cadastro sem `aceiteLgpd` → `422`; com aceite → `201`, com `consentimentoLgpdEm` igual, ao milissegundo, ao log `CONSENTIMENTO_LGPD_ACEITO` | Confirmado |
| Minimização: telefone do palestrante removido; e-mail do palestrante fora da resposta para ALUNO | `schema.prisma`, `utils/dto.ts` (`palestranteParaDTO`), `palestrantes.routes.ts` | Migration de remoção aplicada no dev e em produção; requisição como ALUNO a `GET /palestrantes` volta só `id` e `nome` | Confirmado |
| Cabeçalhos de segurança e limite de corpo | `expressApp.ts` (`helmet`, `express.json({ limit: "256kb" })`), `errorHandler.ts` | Requisição local (28/09/2026) a `/health`: sem `X-Powered-By`; `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options` e `X-Frame-Options` presentes. `POST /api/auth/login` com corpo de 300 kb → `413 CORPO_MUITO_GRANDE` | Confirmado |
| Logs do servidor sem dado pessoal | `email.service.ts`, `auth.service.ts` | Revisão de código: o envio simulado e a falha do SendGrid registram só o tipo do e-mail e a mensagem de erro | Confirmado |
| Limite de tentativas de login e de recuperação (conta e IP) | `utils/limiteAcesso.ts`, `auth.service.ts`, tabela `limites_acesso` | Teste automatizado no banco `SGEA_dev` (Fase 2, bloco 2): 5 erros bloqueiam a conta (isolado do IP); 5 erros de contas diferentes bloqueiam o IP (isolado da conta); mensagem idêntica para senha errada, conta inexistente e conta bloqueada; bloqueio expira sozinho; login certo zera só o contador da conta; pedido de recuperação conta toda chamada; desbloqueio manual só por ADMINISTRADOR, com `BLOQUEIO_LOGIN_REMOVIDO` | Confirmado, 39/39 verificações |
| Invalidação de sessão | `middleware/auth.ts`, `usuarios.versaoToken` | Mesmo teste do bloco 2: após trocar a senha pela recuperação e após inativar o participante, o token antigo recebe `401`; token no formato anterior (sem versão) continua aceito, então o deploy não desloga ninguém. Teste do 2FA: desativar e resetar o 2FA também derrubam as sessões antigas | Confirmado |
| Separação de ambientes | `backend/.env` → `SGEA_dev`; `.env.production.local` só para migration; `.env.example` sem segredo | O teste do 2FA se recusa a rodar se `DATABASE_URL` não for o `SGEA_dev`; todos os testes da Fase 2 rodaram no `SGEA_dev` | Confirmado |
| 2FA: configuração (QR no servidor, segredo cifrado, confirmação obrigatória) | `modules/mfa/mfa.service.ts` | Teste automatizado: QR code volta como PNG em data URL gerado no servidor; chamar de novo antes de confirmar devolve o mesmo segredo; segredo gravado cifrado (não aparece em texto puro no banco); 2FA só fica ativo depois de um código válido; código errado → `422` | Confirmado |
| 2FA: códigos de recuperação | `mfa.service.ts`, tabela `codigos_recuperacao_mfa` | Ativação devolve 8 códigos distintos, gravados só como hash; código de recuperação funciona no lugar do TOTP (inclusive digitado em minúsculo e sem hífen) e não funciona uma segunda vez | Confirmado |
| 2FA: login em duas etapas e token temporário restrito | `auth.service.ts` (`login`), `middleware/auth.ts` | Login com 2FA ativo devolve só o token "2FA pendente"; esse token em `/usuarios/me`, `/eventos` e na rota de configuração → `401`; código certo (dentro da tolerância de ±1 janela) → sessão | Confirmado |
| 2FA: reuso e força bruta | `mfa.service.ts` (`conferirCodigoTotp`, `limiteAcesso`) | Reuso do mesmo código na mesma janela → `422`; depois de 5 códigos errados, até um código válido é recusado com `429`, sem gastar o código de recuperação; `MFA_BLOQUEADO` na auditoria; desbloqueio pelo administrador libera | Confirmado |
| 2FA obrigatório para a equipe | `middleware/auth.ts` (`MFA_OBRIGATORIO`), `auth.service.ts` | Sessão de secretaria sem 2FA (emitida no formato antigo) → `401 MFA_OBRIGATORIO`; login de secretaria e de administrador sem 2FA → só o token de configuração, que não acessa nenhuma outra rota; ao confirmar, recebe códigos de recuperação e a sessão; secretaria não consegue desativar (`403`) | Confirmado |
| 2FA: desativação pelo aluno | `mfa.service.ts` (`desativar`) | Senha errada → `422`; senha + código certos → `200` com sessão nova; token antigo → `401`; sessão nova mostra `mfaAtivo=false`; login volta a pedir só a senha; `MFA_DESATIVADO` na auditoria | Confirmado |
| 2FA: reset pelo administrador e script de emergência | `usuarios.routes.ts`, `backend/scripts/resetar-2fa.ts` | Secretaria e aluno não resetam nem listam (`403`); administrador reseta a secretaria → segredo e códigos apagados, sessões encerradas, próximo login volta à configuração obrigatória, `MFA_RESETADO` com o administrador como autor; script de emergência (rodado no dev) reseta o administrador e registra `MFA_RESETADO` com origem "script de emergência" | Confirmado |
| Sem serviço externo além dos três documentados | `frontend/index.html`, `package.json` (frontend e backend) | Inspeção manual de todo import/script/dependência; as bibliotecas novas do backend (`otplib`, `qrcode`) rodam localmente | Confirmado — nenhum CDN, analytics, API de QR code ou SDK de terceiro além de TiDB/SendGrid/Vercel |
| Nenhuma migration destrutiva aplicada sem confirmação prévia | Processo de trabalho deste PFC | Todas as migrations foram mostradas antes de aplicar em produção; a única que remove algo (telefone do palestrante) foi aprovada explicitamente | Confirmado, histórico em `backend/prisma/migrations/` |

### Como reproduzir o teste do 2FA

```
cd backend
npx tsx scripts/testar-2fa.ts
```

O script sobe o backend numa porta local, cria contas de teste próprias no
`SGEA_dev`, faz as chamadas HTTP de verdade e apaga as contas no final (os
logs de auditoria ficam, como em qualquer outra operação). Resultado em
28/09/2026: **54/54 verificações passaram**.

## Controles pendentes — sem evidência ainda

| Controle | Onde vai ficar | Como será testado (planejado) |
|---|---|---|
| Reaceite de Termos/Política quando a versão muda | O backend já grava a versão no cadastro, devolve `precisaAceitarTermos` no login e tem a rota `POST /auth/aceitar-termos`; falta a tela que pede o novo aceite | Mudar a versão vigente e confirmar que o próximo login pede o aceite e registra `TERMOS_REACEITOS` |
| Página "Meus dados" (acesso, correção, exportação, exclusão, revisão de decisão automatizada) | Novo módulo frontend + backend | Teste end-to-end de cada botão, incluindo exportação (conferir que o JSON tem todos os campos esperados e nenhum a mais) |
| Anonimização em vez de hard delete | `participantes.service.ts` (reescrito) | Teste automatizado: após "excluir", nome/e-mail/RGM não decifram mais pro valor original; inscrições/certificados continuam existindo sem vínculo pessoal; comentário de feedback foi apagado, nota permanece |
| Rotina de retenção automática (24 meses sem login, códigos expirados, logs de 5 anos, registros de limite por IP) | Rota protegida + agendamento (Vercel Cron) | Rodar a rotina duas vezes seguidas e confirmar que a segunda execução não repete nenhuma ação (idempotência); testar cada critério isoladamente com dado fabricado no banco de teste |
| Script de limpeza dos dados de demonstração | `backend/scripts/` | Rodar e confirmar que todo registro com prefixo `[TESTE]`/`Teste` do lote de demonstração some do banco |

Este documento será atualizado a cada bloco da Fase 2 e novamente ao final
da Fase 3, quando os testes automatizados restantes (aluno acessando dado
de outro, exportação, exclusão/anonimização, descarte de código expirado)
estiverem escritos e rodando contra o banco de teste.
