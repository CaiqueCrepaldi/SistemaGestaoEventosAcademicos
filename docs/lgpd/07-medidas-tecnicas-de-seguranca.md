# Medidas técnicas de segurança — SGEA

**Data:** 29/09/2026 · **Versão:** 3 (hash de senha com custo 12, 2FA
opcional para todos os perfis, fim da criptografia de nome/e-mail/RGM,
inativação e feedback padronizados; a versão 2, de 28/09/2026, trazia o 2FA
obrigatório para a equipe e a criptografia desses campos)

Descrição técnica das medidas de segurança do SGEA, em nível suficiente
para auditoria acadêmica sem publicar receita de ataque (a Política de
Privacidade, pública, descreve isso em nível ainda mais geral). Cada item
diz claramente se já está implementado ou se é uma limitação conhecida.

## Já implementado (evidência em código)

| Medida | Como funciona | Onde está |
|---|---|---|
| Hash de senha | bcrypt com **custo 12** (2¹² rodadas) e **salt aleatório de 128 bits por senha**, embutido no próprio texto do hash — a mesma senha nunca gera o mesmo hash. Hash antigo (custo 10) é refeito no próximo login da pessoa, sem ela precisar trocar a senha, e o refazimento fica na auditoria (`SENHA_HASH_ATUALIZADO`). Formato e evidência na seção "Formato do hash de senha" abaixo | `backend/src/utils/password.ts`, `auth.service.ts` (`login`) |
| Proteção de nome, e-mail e RGM | São dados pessoais comuns (art. 5º, I da LGPD), não sensíveis (art. 5º, II), e ficam em **texto puro** no banco. A proteção é: controle de acesso por perfil no backend (nenhum perfil lê o que não precisa; o aluno só enxerga os próprios dados), HTTPS entre navegador e servidor, conexão com o banco sempre por TLS com verificação de certificado (`sslaccept=strict`), banco com acesso restrito (credenciais só em variável de ambiente, nunca no repositório) e trilha de auditoria. A criptografia desses campos (AES-256-GCM) foi usada até 29/09/2026 e retirada por decisão do projeto: ela não protegia contra quem tem acesso ao sistema (que precisa ler os dados de qualquer jeito) e dificultava busca, ordenação e unicidade no banco | `backend/src/utils/dadosPessoais.ts`, `backend/scripts/converter-dados-pessoais.ts` |
| Criptografia do que continua sendo credencial | O segredo do 2FA (que gera os códigos de acesso) continua cifrado com AES-256-GCM, IV aleatório por valor. A `ENCRYPTION_KEY` segue existindo só pra isso. Os índices de busca de e-mail/RGM (HMAC-SHA256 com a mesma chave) continuam sendo mantidos até a conversão dos registros antigos terminar | `backend/src/utils/criptografia.ts`, `mfa.service.ts` |
| Autenticação | JWT assinado (HS256), expiração de 8h, validado em toda rota autenticada; a cada requisição o middleware também confere no banco se a sessão não foi invalidada (ver "Invalidação de sessão") | `backend/src/utils/jwt.ts`, `backend/src/middleware/auth.ts` |
| Autenticação em dois fatores (TOTP, RFC 6238) | **Opcional para todos os perfis** (ADMINISTRADOR, SECRETARIA e ALUNO): cada pessoa ativa ou desativa a própria na página "Minha conta". Código de 6 dígitos gerado por aplicativo autenticador instalado no celular (passo de 30 s, tolerância de ±1 passo). Não usa SMS nem e-mail: o código é gerado no próprio aparelho, sem serviço externo | `backend/src/modules/mfa/` |
| Segredo do 2FA protegido | Gerado no servidor (biblioteca `otplib`); o QR code também é gerado no servidor (biblioteca `qrcode`) — nunca por API externa de QR code, que receberia o segredo. Gravado cifrado (`usuarios.mfaSegredoCifrado`); nunca em texto puro, nunca em log, nunca em resposta da API depois da configuração | `mfa.service.ts` (`iniciarConfiguracao`) |
| Login em duas etapas | Com o 2FA ativo, e-mail + senha certos devolvem só um token temporário "2FA pendente" (5 min), aceito apenas na rota de verificação do código; qualquer outra rota o recusa com `401`. Só depois do código certo é emitida a sessão normal | `auth.service.ts` (`login`), `middleware/auth.ts` (`autenticarEtapaMfa`) |
| Código TOTP de uso único | O passo de tempo de cada código aceito é gravado (`usuarios.mfaUltimoPasso`); código do mesmo passo ou de passo anterior é recusado. A gravação é condicional no banco, então duas requisições simultâneas com o mesmo código não passam as duas | `mfa.service.ts` (`conferirCodigoTotp`) |
| Códigos de recuperação do 2FA | 8 códigos de ~50 bits gerados na ativação, mostrados uma única vez; só o hash (HMAC-SHA256 com a chave do servidor) é gravado. Cada código vale uma vez no lugar do TOTP, marcado como usado de forma atômica | `mfa.service.ts`, tabela `codigos_recuperacao_mfa` |
| Limite de tentativas | Login e pedido de código de recuperação de senha: 5 tentativas por conta **e** por IP, bloqueio de 15 min. Código do 2FA (login, confirmação da configuração, desativação): 5 tentativas por conta, bloqueio de 15 min. Persistido no banco (tabela `limites_acesso`), porque a Vercel é serverless e memória local não sobrevive entre invocações; o bloqueio expira sozinho, e o ADMINISTRADOR pode removê-lo antes pela tela Usuários (registrado na auditoria) | `backend/src/utils/limiteAcesso.ts`, `auth.service.ts`, `mfa.service.ts`, `usuarios.routes.ts` |
| Invalidação de sessão | Versão de token por usuário (`usuarios.versaoToken`), gravada no JWT e conferida em toda requisição. Sobe — encerrando todas as sessões já emitidas — na troca de senha por recuperação, na inativação do aluno, na desativação do 2FA (a sessão de quem desativou é reemitida) e no reset do 2FA | `middleware/auth.ts`, `auth.service.ts`, `participantes.service.ts`, `mfa.service.ts` |
| Inativação de aluno | Só ADMINISTRADOR e SECRETARIA inativam e reativam, com motivo obrigatório na inativação (fica só no cadastro, nunca no log) e auditoria nos dois casos. Aluno inativo: não faz login (vê só "Sua conta está inativa. Procure a secretaria.", sem o motivo), não se inscreve (nem pela secretaria), não recebe check-in e não responde questionário — cada regra é conferida no backend, não só na tela. Inativar encerra as sessões abertas e cancela as inscrições **pendentes** em eventos futuros (liberando a vaga, cada cancelamento na auditoria como `INSCRICAO_CANCELADA`); presenças e certificados já emitidos continuam valendo. Reativar libera o login de novo. As telas da equipe mostram o badge "Inativo" | `participantes.service.ts`, `auth.service.ts`, `inscricoes.service.ts`, `eventos.service.ts`, `questionario.service.ts` |
| Conta sem uso × aluno inativado | São conceitos diferentes, com nomes diferentes: **"inativado"** é a ação da equipe descrita acima (`participantes.ativo = false`); **"conta sem uso"** é o critério de retenção de 24 meses sem login, que leva à anonimização (ver `04-plano-de-retencao-e-descarte.md`, ainda não automatizado) | — |
| Feedback é do aluno | Só o aluno envia feedback, sempre em nome dele (o `participanteId` vem do token) e só de palestra em que recebeu o certificado. Ninguém edita depois de enviado (`PUT` → `403` para todos os perfis). O aluno pode excluir o próprio feedback (com confirmação na tela) e depois enviar outro para o mesmo evento — é assim que ele corrige. A equipe não escreve nem altera feedback de aluno: só exclui, escolhendo um motivo de uma lista fechada (lista fechada de propósito: o motivo vai para o log de auditoria, e texto livre ali poderia carregar dado pessoal). Auditoria `FEEDBACK_EXCLUIDO` diz se foi o próprio aluno ou a equipe, com o motivo | `feedbacks.routes.ts`, `feedbacks.service.ts`, `feedbacks.schemas.ts` |
| Reset do 2FA | ADMINISTRADOR reseta o 2FA de quem perdeu o celular pela tela Usuários: apaga segredo e códigos de recuperação e encerra as sessões da pessoa, que volta a entrar só com a senha. Para o caso de o único administrador perder o celular e os códigos, há um script de emergência de linha de comando (`backend/scripts/resetar-2fa.ts`), que só funciona com acesso às credenciais de produção e também registra na auditoria | `usuarios.routes.ts`, `backend/scripts/resetar-2fa.ts` |
| Auditoria do 2FA | `MFA_ATIVADO`, `MFA_DESATIVADO`, `MFA_VERIFICADO`, `MFA_FALHA`, `MFA_BLOQUEADO`, `MFA_RESETADO` (com quem resetou, ou "script de emergência"), `CODIGO_RECUPERACAO_USADO` — nenhum registro contém o segredo nem um código | `mfa.service.ts`, `utils/auditoria.ts` |
| Autorização por perfil e por posse | Middleware `autorizar(...)` nega por padrão; toda rota revisada confere perfil e, onde cabe, dono do registro no backend (nunca só no frontend) | Ver `03-matriz-perfis-e-permissoes.md` — cobertura de 100% das rotas |
| Trilha de auditoria | Cada operação sensível grava um evento, com uma cópia do nome de quem agiu (`atorNome`) para o registro continuar dizendo quem foi mesmo se a conta sair do sistema. Nenhuma rota edita ou apaga log. A única alteração de linhas existentes é a conversão única do nome do responsável do formato cifrado para texto (script de conversão), sem mudar o conteúdo, registrada na própria auditoria (`CONVERSAO_DADOS_PESSOAIS`) | `backend/src/utils/auditoria.ts`, `backend/prisma/schema.prisma` (`onDelete: SetNull` na relação com usuário) |
| Cabeçalhos de segurança HTTP | `helmet` em toda resposta da API (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`); `X-Powered-By` removido | `backend/src/expressApp.ts` |
| Limite de tamanho do corpo | `express.json({ limit: "256kb" })`; acima disso a API responde `413 CORPO_MUITO_GRANDE` | `expressApp.ts`, `middleware/errorHandler.ts` |
| Logs do servidor sem dado pessoal | O envio de e-mail simulado e as falhas do SendGrid registram só o tipo do e-mail e a mensagem de erro; falha ao gravar auditoria registra só a ação e o código do erro — nunca destinatário, conteúdo, nome, código de recuperação ou o objeto de erro bruto | `email.service.ts`, `auth.service.ts`, `utils/auditoria.ts` |
| Validação na tela e no servidor | Todo formulário marca os campos obrigatórios com `*`, mostra embaixo do campo o que falta (borda vermelha) e leva o foco ao primeiro campo inválido; os erros de validação do backend (`erros: [{ campo, mensagem }]`) aparecem embaixo do campo certo. A validação da tela é só conforto: o backend valida tudo de novo (Zod) | `frontend/src/components/ui/Campo.tsx`, `frontend/src/hooks/useErrosFormulario.ts`, `*.schemas.ts` |
| Consulta parametrizada / ORM | 100% do código de aplicação usa Prisma; não há SQL concatenado com entrada do usuário em rota nenhuma | Todos os `*.service.ts` |
| Segredos fora do código | `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `SENDGRID_API_KEY` só existem em variável de ambiente, nunca no repositório (`.gitignore` cobre `.env`/`.env.*`, com exceção proposital de `.env.example`) | `backend/src/config/env.ts` |
| Separação de ambientes | Desenvolvimento e testes usam o banco `SGEA_dev` (outro database no mesmo cluster TiDB); o `.env` local aponta pra ele e não tem chave do SendGrid, então não envia e-mail real. A conexão de produção fica só em `.env.production.local`, usado para aplicar migration e rodar os scripts de manutenção com `--producao`. Os testes automatizados se recusam a rodar se o banco não for o `SGEA_dev` | `backend/.env.example`, `backend/scripts/testar-*.ts` |
| Backup do banco protegido pelo provedor | TiDB Cloud faz backup automático diário (07:00 UTC) do cluster, com expiração de 1 dia por backup — confirmado no console do provedor | Configuração do provedor, fora do código; documentado em `04-plano-de-retencao-e-descarte.md` |
| Recuperação de senha com limite de tentativas e expiração | Código de 6 dígitos, hash bcrypt (nunca texto puro no banco), validade de 15 minutos, bloqueado após 5 tentativas erradas | `backend/src/modules/auth/auth.service.ts` |
| Mensagens genéricas contra enumeração | Login responde igual pra "senha errada", "conta não existe" e "conta bloqueada por tentativas", sem dar dica de qual foi | `auth.service.ts` |
| HTTPS em produção | Garantido pela plataforma de hospedagem (Vercel) | Nível de infraestrutura |

## Formato do hash de senha

O bcrypt grava tudo que precisa para conferir a senha num único texto de 60
caracteres:

```
$2a$12$Q/a7ZfvQ4rkEI9tJHtXmVuNyWCy.h91AP4/2FmC/VzV46gkE7qcbK
└┬─┘└┬┘└─────────┬──────────┘└──────────────┬──────────────┘
 │   │           │                          └ hash: 31 caracteres (184 bits)
 │   │           └ salt: 22 caracteres (128 bits aleatórios, novo a cada senha)
 │   └ custo: 12 → 2¹² = 4.096 rodadas do algoritmo
 └ versão do formato bcrypt
```

- **Versão (`$2a$` / `$2b$`):** identifica a revisão do formato bcrypt. A
  biblioteca usada (`bcryptjs`) grava `$2a$`; o `$2b$` é a revisão criada
  pelo OpenBSD em 2014 para corrigir um erro da implementação deles com
  senhas muito longas. As duas revisões têm o mesmo formato (custo + salt +
  hash) e são aceitas na verificação.
- **Custo:** quanto maior, mais lento calcular cada hash — o que atrasa
  quem tenta adivinhar senhas em massa a partir de um hash vazado. Com custo
  12, gerar um hash levou cerca de 215 ms na máquina de desenvolvimento.
  O custo sai do próprio hash na verificação, por isso hashes com custos
  diferentes convivem no banco.
- **Salt:** gerado aleatoriamente para cada senha e guardado junto do hash.
  Duas pessoas com a mesma senha têm hashes diferentes, e tabelas
  pré-calculadas de senhas não servem para nada.
- O bcrypt considera só os primeiros 72 bytes da senha — mais do que
  suficiente para senhas comuns.

**Exemplo real do banco de desenvolvimento** (contas temporárias criadas só
para a demonstração, as duas com a mesma senha `SenhaDeExemplo123`, pelo
script `backend/scripts/demonstrar-hash-senha.ts`, em 29/09/2026):

```
conta 1: $2a$12$Q/a7ZfvQ4rkEI9tJHtXmVuNyWCy.h91AP4/2FmC/VzV46gkE7qcbK
conta 2: $2a$12$D3evpeUje/tpEQnths4pHuIPT4Vw70FONNRZD4cZGYeh/lFGM6YDi
```

Mesma senha, salts diferentes (`Q/a7ZfvQ4rkEI9tJHtXmVu` × `D3evpeUje/tpEQnths4pHu`)
e, por isso, hashes diferentes; a senha confere com os dois e uma senha
errada não confere com nenhum. Nenhum hash de produção é publicado.

**Custo 10 → 12 sem troca de senha:** no login, logo depois de conferir a
senha digitada, o sistema vê o custo gravado no hash; se for menor que 12,
gera um hash novo com custo 12 a partir da senha que acabou de ser
conferida e substitui o antigo. Quem não entrar mais fica com o hash de
custo 10 até o próximo login (ou até a conta sair pela retenção).

## Limitações conhecidas (não implementado hoje)

Listadas explicitamente porque o guia trata "esconder lacuna" como pior do
que declará-la.

| Lacuna | Risco | Plano |
|---|---|---|
| Token em `localStorage`, não em cookie `HttpOnly` | Mais exposto a XSS do que um cookie `HttpOnly`/`Secure`/`SameSite` (decisão de arquitetura já existente do projeto) | Registrado como limitação conhecida, sem mudança planejada — mudar exigiria reescrever a camada de sessão inteira |
| 2FA não é exigido de ninguém | Uma conta de equipe sem 2FA ativo depende só da senha | Decisão do projeto (29/09/2026): o 2FA é opcional para todos. A recomendação para a equipe é ativar; o limite de tentativas e a auditoria continuam valendo para todos |
| Registros do limite por IP não são apagados | A linha de `limites_acesso` com o IP (`login:ip:<ip>`) continua na tabela depois que o bloqueio expira (com o contador zerado) | Descarte pela rotina automática de retenção (Fase 2, bloco 6 — ainda não implementada) |
| Sem troca de senha estando logado | A única forma de trocar a senha é o fluxo "Esqueci minha senha", por e-mail | Registrado como limitação conhecida |
| Recuperação de senha revela se o e-mail está cadastrado | `POST /auth/recuperacao-senha` responde `404` ("Não encontramos conta com esse e-mail") quando o e-mail não existe, o que permite descobrir se um e-mail tem conta. O limite de 5 pedidos por conta e por IP reduz a varredura em massa, mas não elimina a descoberta pontual | Trocar por resposta idêntica nos dois casos — pendente de decisão da equipe, porque muda o que a tela mostra a quem digitou o e-mail errado |
| ~~Palestrante em texto puro~~ | ~~`nome`/`email`/`telefone` sem cifra~~ | **Resolvido:** telefone removido do sistema (não era usado em nenhum fluxo). Nome e e-mail em texto puro, como os dados do aluno — não são dados sensíveis, a edição é restrita à equipe, o e-mail não vai para o perfil ALUNO e o nome já é público na agenda do evento |

## Práticas de desenvolvimento seguro adotadas neste PFC

- Toda migration de banco é aditiva (coluna ou tabela nova) ou documentada
  e aprovada explicitamente antes de aplicar em produção — nunca
  `migrate reset`/`db push` contra o banco real. Migration aditiva é
  aplicada em produção antes do deploy do código que depende dela; a que
  remove ou renomeia é aplicada depois.
- Mudança de formato de dado em produção (como a conversão de nome/e-mail/RGM)
  é feita em duas implantações: primeiro o código passa a ler os dois
  formatos, depois os dados são convertidos por script idempotente (com
  simulação antes), e só então o código antigo sai.
- Testes que escrevem dado rodam contra o banco de desenvolvimento
  (`SGEA_dev`), nunca contra a produção — ver
  `10-evidencias-de-implementacao-e-testes.md` e
  `docs/verificacao-de-requisitos.md`.
