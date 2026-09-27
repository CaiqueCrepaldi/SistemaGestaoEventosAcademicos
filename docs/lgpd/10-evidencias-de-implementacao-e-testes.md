# Evidências de implementação e testes — SGEA

**Data:** 27/09/2026 · **Versão:** 1 (controles existentes antes da Fase 2 —
atualizado ao final das Fases 2 e 3 com o restante)

Para cada controle, onde está no código, como foi testado e o resultado.
Controles que ainda não existem (Fase 2) aparecem como "pendente" — não têm
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
| Log nunca contém dado sensível no `detalhe` | Todos os `registrarAuditoria(...)` do código | Varredura automatizada: nenhum dos ~40 logs gerados num teste completo do sistema continha e-mail, nome, senha, código, RGM ou token no campo `detalhe` | Confirmado, 0 vazamentos em 44 logs inspecionados |
| Log sobrevive à exclusão do usuário, com cópia do nome | `LogAuditoria.atorNomeCifrado`, relação `onDelete: SetNull` | Teste automatizado: cria log, exclui o usuário, confere que o total de logs não muda, `usuarioId` vira nulo e `atorNomeCifrado` continua decifrável pro nome correto | Confirmado |
| Recuperação de senha com hash + limite de tentativas | `auth.service.ts` | Testes automatizados: código errado incrementa tentativa; 5 erros bloqueia mesmo o código certo depois; reuso do código já usado é barrado | Confirmado |
| Aceite de Termos/Política obrigatório e datado pelo servidor | `auth.schemas.ts` (`z.literal(true)`), `auth.service.ts` | Cadastro sem `aceiteLgpd` → `422`; com aceite → `201`, com `consentimentoLgpdEm` igual, ao milissegundo, ao log `CONSENTIMENTO_LGPD_ACEITO` | Confirmado |
| Sem serviço externo além dos três documentados | `frontend/index.html`, `package.json` (frontend e backend) | Inspeção manual de todo import/script/dependência | Confirmado — nenhum CDN, analytics ou SDK de terceiro além de TiDB/SendGrid/Vercel |
| Nenhuma migration destrutiva aplicada sem confirmação prévia | Processo de trabalho deste PFC | Todas as migrations até aqui foram aditivas (coluna nova, nullable) e mostradas antes de aplicar | Confirmado, histórico em `backend/prisma/migrations/` |

## Controles pendentes (Fase 2/3) — sem evidência ainda

| Controle | Onde vai ficar | Como será testado (planejado) |
|---|---|---|
| Limite de tentativas de login | `auth.service.ts` + nova tabela/campo de bloqueio | Teste automatizado: N logins errados seguidos → bloqueio temporário; login correto durante o bloqueio → ainda barrado |
| Invalidação de sessão (troca de senha/inativação/exclusão) | Versão de token em `Usuario`, checada em `autenticar` | Teste automatizado: token emitido antes da troca de senha deixa de funcionar logo depois |
| Página "Meus dados" (acesso, correção, exportação, exclusão, revisão de decisão automatizada) | Novo módulo frontend + backend | Teste end-to-end de cada botão, incluindo exportação (conferir que o JSON tem todos os campos esperados e nenhum a mais) |
| Anonimização em vez de hard delete | `participantes.service.ts` (reescrito) | Teste automatizado: após "excluir", nome/e-mail/RGM não decifram mais pro valor original; inscrições/certificados continuam existindo sem vínculo pessoal; comentário de feedback foi apagado, nota permanece |
| Rotina de retenção automática (24 meses sem login, códigos expirados, logs de 5 anos) | Rota protegida + agendamento (Vercel Cron) | Rodar a rotina duas vezes seguidas e confirmar que a segunda execução não repete nenhuma ação (idempotência); testar cada critério isoladamente com dado fabricado no banco de teste |
| Cabeçalhos de segurança (helmet), limite de corpo, `x-powered-by` desativado | `expressApp.ts` | Teste de requisição confirmando os cabeçalhos de resposta |
| `console.info`/`console.error` higienizados | `email.service.ts`, `auth.service.ts` | Revisão de código + teste forçando a falha de envio e inspecionando o log gerado |
| Separação de banco dev/teste/produção | Novo banco no mesmo cluster TiDB + `.env.example` | Confirmar que `npm run dev` e os testes automatizados não conseguem, nem por engano, escrever no banco de produção |
| Cifra dos dados do palestrante (se decidido) | `schema.prisma`, `palestrantes.service.ts` | Mesmo padrão de migração em duas fases já usado para aluno/usuário |
| Script de limpeza dos dados de demonstração | `backend/scripts/` | Rodar e confirmar que todo registro com prefixo `[TESTE]`/`Teste` do lote de demonstração some do banco |

Este documento será reexecutado ao final da Fase 2 (item 9 do pedido
original) e novamente ao final da Fase 3, quando os testes automatizados
específicos desta tarefa (aluno acessando dado de outro, bloqueio de
força bruta, sessão invalidada, exportação, exclusão/anonimização, descarte
de código expirado, auditoria de cada ação sensível) estiverem escritos e
rodando contra o banco de teste.
