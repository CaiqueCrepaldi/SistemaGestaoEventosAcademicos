# Medidas técnicas de segurança — SGEA

**Data:** 27/09/2026 · **Versão:** 1 (estado ao final da Fase 1 — a Fase 2
atualiza este documento com o que for implementado)

Descrição técnica das medidas de segurança do SGEA, em nível suficiente
para auditoria acadêmica sem publicar receita de ataque (a Política de
Privacidade, pública, descreve isso em nível ainda mais geral). Cada item
diz claramente se já está implementado ou se é um plano da Fase 2.

## Já implementado (evidência em código)

| Medida | Como funciona | Onde está |
|---|---|---|
| Criptografia em repouso de dado sensível | AES-256-GCM com IV aleatório por valor cifrado (o mesmo texto gera saída diferente a cada vez); índice de busca separado por HMAC-SHA256 (determinístico, mas não reversível) pra permitir login/checagem de duplicidade sem expor o valor | `backend/src/utils/criptografia.ts` |
| Hash de senha | bcrypt, fator de custo 10, salt automático por hash | `backend/src/utils/password.ts` |
| Autenticação | JWT assinado (HS256), expiração de 8h, validado em toda rota autenticada | `backend/src/utils/jwt.ts`, `backend/src/middleware/auth.ts` |
| Autorização por perfil e por posse | Middleware `autorizar(...)` nega por padrão; toda rota revisada confere perfil e, onde cabe, dono do registro no backend (nunca só no frontend) | Ver `03-matriz-perfis-e-permissoes.md` — cobertura de 100% das rotas |
| Trilha de auditoria imutável | Cada operação sensível grava um evento; a tabela só recebe `INSERT` em todo o código (sem `UPDATE`/`DELETE` em nenhuma rota, service ou script) | `backend/src/utils/auditoria.ts`, `backend/prisma/schema.prisma` (`onDelete: SetNull` na relação com usuário) |
| Consulta parametrizada / ORM | 100% do código de aplicação usa Prisma; não há SQL concatenado com entrada do usuário em rota nenhuma | Todos os `*.service.ts` |
| Segredos fora do código | `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `SENDGRID_API_KEY` só existem em variável de ambiente, nunca no repositório (`.gitignore` cobre `.env`/`.env.*`, com exceção proposital de `.env.example`) | `backend/src/config/env.ts` |
| Backup do banco protegido pelo provedor | TiDB Cloud faz backup automático diário (07:00 UTC) do cluster, com expiração de 1 dia por backup — confirmado no console do provedor | Configuração do provedor, fora do código; documentado em `04-plano-de-retencao-e-descarte.md` |
| Recuperação de senha com limite de tentativas e expiração | Código de 6 dígitos, hash bcrypt (nunca texto puro no banco), validade de 15 minutos, bloqueado após 5 tentativas erradas | `backend/src/modules/auth/auth.service.ts` |
| Mensagens genéricas contra enumeração | Login e recuperação de senha respondem igual pra "credencial errada" e "conta não existe", sem dar dica de qual dos dois foi | `auth.service.ts` |
| HTTPS em produção | Garantido pela plataforma de hospedagem (Vercel) | Nível de infraestrutura |

## Limitações conhecidas (não implementado hoje)

Listadas explicitamente porque o guia trata "esconder lacuna" como pior do
que declará-la. Cada uma tem um plano associado.

| Lacuna | Risco | Plano |
|---|---|---|
| Sem limite de tentativas de login | Permite força bruta de senha por tentativa e erro (a auditoria registra, mas não bloqueia) | Fase 2 item 4 — bloqueio temporário por conta e por IP, persistido no banco (a Vercel é serverless, memória local não sobrevive entre invocações) |
| Sessão não é revogável | Trocar senha, inativar ou excluir conta não invalida um token já emitido — continua valendo até expirar (até 8h) | Fase 2 item 4 — versão de token no `Usuario`, conferida em `autenticar` |
| Sem cabeçalhos de segurança HTTP (helmet) | `X-Powered-By: Express` exposto por padrão; sem `X-Content-Type-Options`, `X-Frame-Options` etc. | Fase 2 item 4 |
| Sem limite explícito de tamanho de corpo de requisição | `express.json()` sem `limit` customizado (usa o padrão da biblioteca, 100kb) | Fase 2 item 4 — definir limite explícito e adequado ao maior payload legítimo (o questionário de 10 perguntas) |
| Token em `localStorage`, não em cookie `HttpOnly` | Mais exposto a XSS do que um cookie `HttpOnly`/`Secure`/`SameSite` (decisão de arquitetura já existente do projeto, fora do escopo de mudar agora) | Registrado como limitação conhecida, não há mudança planejada — mudar exigiria reescrever a camada de sessão inteira |
| Sem autenticação multifator | Nenhum perfil tem MFA, nem os de maior privilégio (ADMINISTRADOR/SECRETARIA) | Fora de escopo proposto para este PFC — registrado como limitação conhecida |
| Sem separação de banco dev/teste/produção | `backend/.env` local aponta pro mesmo banco de produção | Fase 2 item 8 |
| `console.info`/`console.error` que podem expor dado pessoal | Ver detalhe em `00-diagnostico.md` ("Console.log/console.error com dado pessoal") | Fase 2 item 4 |
~~Palestrante em texto puro~~ | ~~`nome`/`email`/`telefone` sem cifra~~ | **Resolvido:** telefone removido do sistema (não era usado em nenhum fluxo). Nome e e-mail continuam em texto puro por decisão explícita — não são dados sensíveis (art. 5º, II da LGPD), o acesso de edição é restrito à equipe (`ADMINISTRADOR`/`SECRETARIA`), e o nome do palestrante já é informação pública, exibida a qualquer perfil autenticado na agenda do evento. Cifrar traria custo (índice de busca, mais uma migração) sem ganho de proteção proporcional a um dado que a própria finalidade do sistema torna público |

## Práticas de desenvolvimento seguro adotadas neste PFC

- Toda migration de banco é aditiva (coluna nova, nullable) ou documentada
  e aprovada explicitamente antes de aplicar em produção — nunca
  `migrate reset`/`db push` contra o banco real.
- Testes que escrevem dado (criação, exclusão, edição em massa) rodam
  contra um banco MySQL local descartável, nunca contra a produção — ver
  `10-evidencias-de-implementacao-e-testes.md` para o método usado nas
  verificações desta própria Fase.
