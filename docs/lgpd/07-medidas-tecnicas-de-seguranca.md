# Medidas técnicas de segurança — SGEA

**Data:** 28/09/2026 · **Versão:** 2 (inclui os controles implementados na
Fase 2 até a autenticação em dois fatores; a versão 1, de 27/09/2026,
descrevia o estado ao final da Fase 1)

Descrição técnica das medidas de segurança do SGEA, em nível suficiente
para auditoria acadêmica sem publicar receita de ataque (a Política de
Privacidade, pública, descreve isso em nível ainda mais geral). Cada item
diz claramente se já está implementado ou se é uma limitação conhecida.

## Já implementado (evidência em código)

| Medida | Como funciona | Onde está |
|---|---|---|
| Criptografia em repouso de dado sensível | AES-256-GCM com IV aleatório por valor cifrado (o mesmo texto gera saída diferente a cada vez); índice de busca separado por HMAC-SHA256 (determinístico, mas não reversível) pra permitir login/checagem de duplicidade sem expor o valor | `backend/src/utils/criptografia.ts` |
| Hash de senha | bcrypt, fator de custo 10, salt automático por hash | `backend/src/utils/password.ts` |
| Autenticação | JWT assinado (HS256), expiração de 8h, validado em toda rota autenticada; a cada requisição o middleware também confere no banco se a sessão não foi invalidada (ver "Invalidação de sessão") | `backend/src/utils/jwt.ts`, `backend/src/middleware/auth.ts` |
| Autenticação em dois fatores (TOTP, RFC 6238) | Código de 6 dígitos gerado por aplicativo autenticador instalado no celular do usuário (passo de 30 s, tolerância de ±1 passo). **Obrigatória para ADMINISTRADOR e SECRETARIA**: sem ela configurada, o login só devolve um token que serve para a tela de configuração, e o middleware `autenticar` recusa em qualquer rota uma sessão de equipe sem 2FA (`401 MFA_OBRIGATORIO`) — a exigência vale em toda requisição, não só no login. **Opcional para ALUNO**, que ativa e desativa na página "Minha conta". Não usa SMS nem e-mail: o código é gerado no próprio aparelho, sem serviço externo | `backend/src/modules/mfa/`, `backend/src/middleware/auth.ts` |
| Segredo do 2FA protegido | Gerado no servidor (biblioteca `otplib`); o QR code também é gerado no servidor (biblioteca `qrcode`) — nunca por API externa de QR code, que receberia o segredo. Gravado cifrado com a mesma AES-256-GCM dos demais dados pessoais (`usuarios.mfaSegredoCifrado`); nunca em texto puro, nunca em log, nunca em resposta da API depois da configuração | `mfa.service.ts` (`iniciarConfiguracao`) |
| Login em duas etapas | E-mail + senha certos com 2FA ativo → token temporário "2FA pendente" (5 min) que só é aceito na rota de verificação do código; qualquer outra rota o recusa com `401`. Só depois do código certo é emitida a sessão normal | `auth.service.ts` (`login`), `middleware/auth.ts` (`autenticarEtapaMfa`) |
| Código TOTP de uso único | O passo de tempo de cada código aceito é gravado (`usuarios.mfaUltimoPasso`); código do mesmo passo ou de passo anterior é recusado. A gravação é condicional no banco, então duas requisições simultâneas com o mesmo código não passam as duas | `mfa.service.ts` (`conferirCodigoTotp`) |
| Códigos de recuperação do 2FA | 8 códigos de ~50 bits gerados na ativação, mostrados uma única vez; só o hash (HMAC-SHA256 com a chave do servidor) é gravado. Cada código vale uma vez no lugar do TOTP, marcado como usado de forma atômica | `mfa.service.ts`, tabela `codigos_recuperacao_mfa` |
| Limite de tentativas | Login e pedido de código de recuperação de senha: 5 tentativas por conta **e** por IP, bloqueio de 15 min. Código do 2FA (login, confirmação da configuração, desativação): 5 tentativas por conta, bloqueio de 15 min. Persistido no banco (tabela `limites_acesso`), porque a Vercel é serverless e memória local não sobrevive entre invocações; o bloqueio expira sozinho, sem rotina agendada, e o ADMINISTRADOR pode removê-lo antes pela tela Usuários (registrado na auditoria) | `backend/src/utils/limiteAcesso.ts`, `auth.service.ts`, `mfa.service.ts`, `usuarios.routes.ts` |
| Invalidação de sessão | Versão de token por usuário (`usuarios.versaoToken`), gravada no JWT e conferida em toda requisição. Sobe — encerrando todas as sessões já emitidas — na troca de senha por recuperação, na inativação do participante, na desativação do 2FA pelo aluno (a sessão de quem desativou é reemitida) e no reset do 2FA | `middleware/auth.ts`, `auth.service.ts`, `participantes.service.ts`, `mfa.service.ts` |
| Reset do 2FA | ADMINISTRADOR reseta o 2FA de quem perdeu o celular pela tela Usuários: apaga segredo e códigos de recuperação e encerra as sessões da pessoa, que configura de novo no próximo login. Para o caso de o único administrador perder o celular e os códigos, há um script de emergência de linha de comando (`backend/scripts/resetar-2fa.ts`), que só funciona com acesso às credenciais de produção e também registra na auditoria | `usuarios.routes.ts`, `backend/scripts/resetar-2fa.ts` |
| Auditoria do 2FA | `MFA_ATIVADO`, `MFA_DESATIVADO`, `MFA_VERIFICADO`, `MFA_FALHA`, `MFA_BLOQUEADO`, `MFA_RESETADO` (com quem resetou, ou "script de emergência"), `CODIGO_RECUPERACAO_USADO` — nenhum registro contém o segredo nem um código | `mfa.service.ts`, `utils/auditoria.ts` |
| Autorização por perfil e por posse | Middleware `autorizar(...)` nega por padrão; toda rota revisada confere perfil e, onde cabe, dono do registro no backend (nunca só no frontend) | Ver `03-matriz-perfis-e-permissoes.md` — cobertura de 100% das rotas |
| Trilha de auditoria imutável | Cada operação sensível grava um evento; a tabela só recebe `INSERT` em todo o código (sem `UPDATE`/`DELETE` em nenhuma rota, service ou script) | `backend/src/utils/auditoria.ts`, `backend/prisma/schema.prisma` (`onDelete: SetNull` na relação com usuário) |
| Cabeçalhos de segurança HTTP | `helmet` em toda resposta da API (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`); `X-Powered-By` removido | `backend/src/expressApp.ts` |
| Limite de tamanho do corpo | `express.json({ limit: "256kb" })`; acima disso a API responde `413 CORPO_MUITO_GRANDE` (antes caía num erro genérico 500) | `expressApp.ts`, `middleware/errorHandler.ts` |
| Logs do servidor sem dado pessoal | O envio de e-mail simulado e as falhas do SendGrid registram só o tipo do e-mail e a mensagem de erro — nunca destinatário, conteúdo, código de recuperação ou o objeto de erro bruto | `backend/src/modules/email/email.service.ts`, `auth.service.ts` |
| Consulta parametrizada / ORM | 100% do código de aplicação usa Prisma; não há SQL concatenado com entrada do usuário em rota nenhuma | Todos os `*.service.ts` |
| Segredos fora do código | `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `SENDGRID_API_KEY` só existem em variável de ambiente, nunca no repositório (`.gitignore` cobre `.env`/`.env.*`, com exceção proposital de `.env.example`) | `backend/src/config/env.ts` |
| Separação de ambientes | Desenvolvimento e testes usam o banco `SGEA_dev` (outro database no mesmo cluster TiDB); o `.env` local aponta pra ele e não tem chave do SendGrid, então não envia e-mail real. A conexão de produção fica só em `.env.production.local`, usado exclusivamente para aplicar migration. Os testes automatizados se recusam a rodar se o banco não for o `SGEA_dev` | `backend/.env.example`, `backend/scripts/testar-2fa.ts` |
| Backup do banco protegido pelo provedor | TiDB Cloud faz backup automático diário (07:00 UTC) do cluster, com expiração de 1 dia por backup — confirmado no console do provedor | Configuração do provedor, fora do código; documentado em `04-plano-de-retencao-e-descarte.md` |
| Recuperação de senha com limite de tentativas e expiração | Código de 6 dígitos, hash bcrypt (nunca texto puro no banco), validade de 15 minutos, bloqueado após 5 tentativas erradas | `backend/src/modules/auth/auth.service.ts` |
| Mensagens genéricas contra enumeração | Login responde igual pra "senha errada", "conta não existe" e "conta bloqueada por tentativas", sem dar dica de qual foi | `auth.service.ts` |
| HTTPS em produção | Garantido pela plataforma de hospedagem (Vercel) | Nível de infraestrutura |

## Limitações conhecidas (não implementado hoje)

Listadas explicitamente porque o guia trata "esconder lacuna" como pior do
que declará-la.

| Lacuna | Risco | Plano |
|---|---|---|
| Token em `localStorage`, não em cookie `HttpOnly` | Mais exposto a XSS do que um cookie `HttpOnly`/`Secure`/`SameSite` (decisão de arquitetura já existente do projeto) | Registrado como limitação conhecida, sem mudança planejada — mudar exigiria reescrever a camada de sessão inteira |
| Configuração do 2FA da equipe no primeiro login | Enquanto uma conta de ADMINISTRADOR/SECRETARIA ainda não configurou o 2FA, quem souber a senha dela faz a configuração. Depois de configurado, a senha sozinha não basta | A equipe configura o 2FA das suas contas logo após a implantação; senhas de equipe não são divulgadas; se alguém configurar indevidamente, o administrador reseta (ou o script de emergência) e o evento fica na auditoria |
| Registros do limite por IP não são apagados | A linha de `limites_acesso` com o IP (`login:ip:<ip>`) continua na tabela depois que o bloqueio expira (com o contador zerado) | Descarte pela rotina automática de retenção (Fase 2, bloco 6 — ainda não implementada) |
| Sem troca de senha estando logado | A única forma de trocar a senha é o fluxo "Esqueci minha senha", por e-mail | Registrado como limitação conhecida |
| Recuperação de senha revela se o e-mail está cadastrado | `POST /auth/recuperacao-senha` responde `404` ("Não encontramos conta com esse e-mail") quando o e-mail não existe, o que permite descobrir se um e-mail tem conta. O limite de 5 pedidos por conta e por IP reduz a varredura em massa, mas não elimina a descoberta pontual | Trocar por resposta idêntica nos dois casos — pendente de decisão da equipe, porque muda o que a tela mostra a quem digitou o e-mail errado |
| ~~Palestrante em texto puro~~ | ~~`nome`/`email`/`telefone` sem cifra~~ | **Resolvido:** telefone removido do sistema (não era usado em nenhum fluxo). Nome e e-mail continuam em texto puro por decisão explícita — não são dados sensíveis (art. 5º, II da LGPD), o acesso de edição é restrito à equipe (`ADMINISTRADOR`/`SECRETARIA`), o e-mail não é enviado ao perfil ALUNO, e o nome do palestrante já é informação pública, exibida a qualquer perfil autenticado na agenda do evento. Cifrar traria custo (índice de busca, mais uma migração) sem ganho de proteção proporcional a um dado que a própria finalidade do sistema torna público |

## Práticas de desenvolvimento seguro adotadas neste PFC

- Toda migration de banco é aditiva (coluna ou tabela nova) ou documentada
  e aprovada explicitamente antes de aplicar em produção — nunca
  `migrate reset`/`db push` contra o banco real. Migration aditiva é
  aplicada em produção antes do deploy do código que depende dela.
- Testes que escrevem dado rodam contra o banco de desenvolvimento
  (`SGEA_dev`), nunca contra a produção — ver
  `10-evidencias-de-implementacao-e-testes.md`.
