# Medidas técnicas de segurança — SGEA

**Data:** 09/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Descrição técnica das medidas de segurança do SGEA, em nível suficiente
para auditoria acadêmica sem publicar receita de ataque (a Política de
Privacidade, pública, descreve isso em nível ainda mais geral). Cada item
diz claramente se já está implementado ou se é uma limitação conhecida.

## Já implementado (evidência em código)

| Medida | Como funciona | Onde está |
|---|---|---|
| Regra da senha nova | Toda senha criada ou trocada (cadastro, nova senha da recuperação, troca pela Minha Conta e primeiro acesso do professor) precisa ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula (acentuada conta), um número e um caractere especial. A mesma função valida no frontend e no backend; a tela mostra a lista de requisitos com ✓ a cada tecla. O login não confere a regra | `backend/src/utils/validacao.ts` (`senhaAtendeRegras`), `frontend/src/utils/validacao.ts`, `frontend/src/components/ui/RequisitosSenha.tsx` |
| Confirmação do e-mail no cadastro | A conta só é criada depois que o aluno digita o código de 6 dígitos enviado ao e-mail institucional (gerado com `crypto.randomInt`). Até lá os dados ficam em `cadastros_pendentes` por até 15 minutos, com a senha e o código **só como hash bcrypt**. O código deixa de valer na 5ª tentativa errada e o reenvio gera um código novo, invalida o anterior, zera as tentativas e exige 60 s desde o último envio. Envios limitados a 5 por e-mail e 20 por IP, com bloqueio de 15 min. O pendente expirado é apagado a cada login e a cada cadastro. Auditoria só com ids | `auth.service.ts` (`iniciarCadastro`, `confirmarCadastro`, `reenviarCodigoCadastro`), tabela `cadastros_pendentes` |
| Convite da conta da equipe | A conta de professor ou de secretaria (esta, criada só pelo administrador) nasce com senha inutilizável e sem aceite dos Termos. O convite é um link com uma chave aleatória de 32 bytes (`crypto.randomBytes`, base64url); no banco fica só o hash SHA-256 (a chave é longa e aleatória, então o hash rápido basta). Vale 24 horas e é de uso único: a chave é apagada na mesma transação que grava a senha e o aceite. Reenviar gera uma chave nova e invalida a anterior (60 s entre envios, 5 por conta em 15 min). A chave vai depois do `#` (`APP_URL/#/primeiro-acesso?convite=...`), parte do endereço que o navegador não manda ao servidor; a tela a tira do endereço com `history.replaceState` e a guarda só na memória. Abrir o link não gasta o convite (antivírus de e-mail abrem links sozinhos). Chave inexistente, vencida ou usada recebe a mesma resposta, e cada chave errada conta no limite por IP. "Esqueci minha senha" trata a conta que ainda espera o convite como inexistente | `professores.service.ts`, `auth.routes.ts`, `PrimeiroAcessoPage.tsx` |
| Troca de senha pela Minha Conta | Qualquer perfil troca a própria senha em "Minha conta" (`POST /api/auth/alterar-senha`, autenticada; a conta é sempre a do token, nunca um id vindo da tela). Pede a senha atual, a nova (mesma regra do cadastro, diferente da atual) e a confirmação; com o 2FA ativo, também o código do aplicativo ou um código de recuperação (que fica gasto). Senha atual ou código errados recebem a mesma mensagem ("Senha atual ou código incorretos.") e contam no limite de tentativas da conta. Ao trocar: grava só o novo hash bcrypt, sobe a versão do token (as outras sessões caem; a de quem trocou é reemitida), invalida códigos de "Esqueci minha senha" pendentes, registra `SENHA_ALTERADA` na auditoria (sem senha nem dado pessoal) e manda um aviso por e-mail com a data e a hora, sem a senha. Se o aviso falhar, a troca continua valendo e a falha vai para a auditoria (`EMAIL_FALHA`) | `backend/src/modules/auth/troca-senha.service.ts`, `auth.schemas.ts` (`alterarSenhaSchema`), `frontend/src/pages/MinhaConta/AlterarSenha.tsx` |
| E-mail do aluno não editável | O e-mail é o login, confirmado por código no cadastro: `PUT /api/participantes/{id}` responde `422` ("O e-mail não pode ser alterado.") se o campo vier, e a tela Participantes mostra o e-mail só para leitura. Assim ninguém, nem a equipe, consegue trocar o login de um aluno para um endereço não confirmado. Mudança de e-mail institucional vai pelo canal de privacidade (ver `08`) | `participantes.routes.ts`, `participantes.schemas.ts`, `ParticipantesPage.tsx` |
| Hash de senha | bcrypt com **custo 12** (2¹² rodadas) e **salt aleatório de 128 bits por senha**, embutido no próprio texto do hash — a mesma senha nunca gera o mesmo hash. Hash antigo (custo 10) é refeito no próximo login da pessoa, sem ela precisar trocar a senha, e o refazimento fica na auditoria (`SENHA_HASH_ATUALIZADO`). Formato e evidência na seção "Formato do hash de senha" abaixo | `backend/src/utils/password.ts`, `auth.service.ts` (`login`) |
| Proteção de nome, e-mail e RGM | São dados pessoais comuns, não sensíveis, e ficam em **texto puro** no banco. A proteção é: controle de acesso por perfil no backend (nenhum perfil lê o que não precisa; o aluno só enxerga os próprios dados; o professor, só os dos inscritos nos eventos dele), HTTPS, conexão com o banco por TLS com verificação de certificado (`sslaccept=strict`), banco com acesso restrito (credenciais só em variável de ambiente) e trilha de auditoria. Minimização: cada dado fica numa tabela só (nome e e-mail na conta, RGM no participante), com a unicidade direto nas colunas | `backend/prisma/schema.prisma` |
| Criptografia do que é credencial | O segredo do 2FA é cifrado com AES-256-GCM (IV aleatório por valor), com a `ENCRYPTION_KEY`, que também assina o HMAC dos códigos de recuperação do 2FA | `backend/src/utils/criptografia.ts`, `mfa.service.ts` |
| Autenticação | JWT assinado (HS256), expiração de 8h, validado em toda rota autenticada; a cada requisição o middleware também confere no banco se a sessão não foi invalidada (ver "Invalidação de sessão") | `backend/src/utils/jwt.ts`, `backend/src/middleware/auth.ts` |
| Autenticação em dois fatores (TOTP, RFC 6238) | **Opcional para todos os perfis** (ADMINISTRADOR, SECRETARIA, PROFESSOR e ALUNO): cada pessoa ativa ou desativa a própria na página "Minha conta". Código de 6 dígitos gerado por aplicativo autenticador instalado no celular (passo de 30 s, tolerância de ±1 passo). Não usa SMS nem e-mail: o código é gerado no próprio aparelho, sem serviço externo | `backend/src/modules/mfa/` |
| Segredo do 2FA protegido | Gerado no servidor (biblioteca `otplib`); o QR code também é gerado no servidor (biblioteca `qrcode`) — nunca por API externa de QR code, que receberia o segredo. Gravado cifrado (`usuarios.mfaSegredoCifrado`); nunca em texto puro, nunca em log, nunca em resposta da API depois da configuração | `mfa.service.ts` (`iniciarConfiguracao`) |
| Login em duas etapas | Com o 2FA ativo, e-mail + senha certos devolvem só um token temporário "2FA pendente" (5 min), aceito apenas na rota de verificação do código; qualquer outra rota o recusa com `401`. Só depois do código certo é emitida a sessão normal | `auth.service.ts` (`login`), `middleware/auth.ts` (`autenticarEtapaMfa`) |
| Código TOTP de uso único | O passo de tempo de cada código aceito é gravado (`usuarios.mfaUltimoPasso`); código do mesmo passo ou de passo anterior é recusado. A gravação é condicional no banco, então duas requisições simultâneas com o mesmo código não passam as duas | `mfa.service.ts` (`conferirCodigoTotp`) |
| Códigos de recuperação do 2FA | 8 códigos de ~50 bits gerados na ativação, mostrados uma única vez; só o hash (HMAC-SHA256 com a chave do servidor) é gravado. Cada código vale uma vez no lugar do TOTP, marcado como usado de forma atômica | `mfa.service.ts`, tabela `codigos_recuperacao_mfa` |
| Limite de tentativas | Login e pedido de código de recuperação de senha: 5 tentativas por conta e 20 por IP (numa rede compartilhada, erros de pessoas diferentes não travam todo mundo), bloqueio de 15 min. Envio do código do cadastro: 5 por e-mail e 20 por IP. Link de convite do professor: 20 chaves erradas por IP. Código do 2FA: 5 tentativas por conta. Troca de senha pela Minha Conta: 5 erros de senha atual ou de código por conta, bloqueio de 15 min. Persistido no banco (tabela `limites_acesso`), porque a Vercel é serverless; o bloqueio expira sozinho, e o ADMINISTRADOR pode removê-lo antes pelo botão "Desbloquear" da tela Participantes (registrado na auditoria) | `backend/src/utils/limiteAcesso.ts`, `auth.service.ts`, `troca-senha.service.ts`, `professores.service.ts`, `mfa.service.ts` |
| Invalidação de sessão | Versão de token por usuário (`usuarios.versaoToken`), gravada no JWT e conferida em toda requisição. Sobe — encerrando todas as sessões já emitidas — na troca de senha por recuperação, na troca de senha pela Minha Conta (a sessão de quem trocou é reemitida), na ativação da conta do professor, na inativação (de aluno ou de professor), na desativação do 2FA (a sessão de quem desativou é reemitida) e no reset do 2FA | `middleware/auth.ts`, `auth.service.ts`, `troca-senha.service.ts`, `participantes.service.ts`, `professores.service.ts`, `mfa.service.ts` |
| Tela Equipe: quem gerencia quem | O ADMINISTRADOR gerencia professores e secretarias; a SECRETARIA, só professores (`403 SO_ADMINISTRADOR` nos outros casos, inclusive ao criar secretaria). Ninguém altera a própria conta por essa tela (`403 PROPRIA_CONTA`). Conta de administrador não aparece, não é criada, inativada nem excluída por ela, e o sistema nunca fica sem administrador ativo (`409 ULTIMO_ADMINISTRADOR`). Excluir só conta inativa ou com convite pendente; com histórico, a conta fica inativa. A exclusão nunca apaga registro de auditoria (`onDelete: SetNull`) | `professores.service.ts` (`contaGerenciavelOuFalhar`, `excluir`), `professores.routes.ts` |
| Inativação de aluno, de professor e de secretaria | Só ADMINISTRADOR e SECRETARIA inativam e reativam (a secretaria, só aluno e professor), com motivo obrigatório (fica só no cadastro, nunca no log) e auditoria nos dois casos. Conta inativa: não faz login (vê só "Sua conta está inativa. Procure a secretaria.", sem o motivo) e as sessões abertas caem. Aluno inativo não se inscreve (nem pela equipe), não pede check-in, não tem o check-in aprovado e não responde questionário; as inscrições sem pedido de check-in em eventos futuros são canceladas (cada uma na auditoria). Professor inativo: os eventos em aberto passam antes para outro professor ativo ou para a equipe, com registro no histórico e na auditoria | `participantes.service.ts`, `professores.service.ts`, `auth.service.ts`, `checkin.service.ts`, `questionario.service.ts` |
| Check-in pedido pelo aluno | O aluno pede o check-in só para si (participante do token), de 1 hora antes do início até 24 horas depois do fim; só o professor do evento (`403` nos outros) ou a equipe decide, e o sistema grava quem decidiu e quando. Depois da primeira tentativa do questionário, a presença não muda mais. A expiração (pedido sem decisão vira recusado; sem pedido, ausente) roda antes das leituras, com `updateMany` idempotente, e registra só as quantidades | `backend/src/modules/checkin/`, `backend/src/utils/checkin.ts` |
| Calendário do professor sem dado dos outros | No calendário, o professor recebe os eventos de outros professores e da equipe só como sala, início e fim; a regra fica na API (`eventos.service.ts`, `calendario`), não só na tela | `eventos.service.ts`, `eventos.routes.ts` |
| Conta sem uso × conta inativada | Conceitos diferentes: **"inativada"** é a ação da equipe descrita acima; **"conta sem uso"** é o critério de retenção de 24 meses sem login (plano, ver `04`) | — |
| Feedback é do aluno | Só o aluno envia feedback, sempre em nome dele (o `participanteId` vem do token) e só de evento em que a presença dele foi confirmada (`PRESENTE`, mesmo antes do questionário; `403 PRESENCA_NAO_CONFIRMADA` nos outros casos). Desfazer a presença (antes do questionário) apaga a avaliação na mesma transação, com `FEEDBACK_EXCLUIDO` só com ids; a tela avisa antes. Ninguém edita depois de enviado (`PUT` → `403` para todos os perfis). O aluno pode excluir o próprio feedback (com confirmação na tela) e depois enviar outro para o mesmo evento — é assim que ele corrige. A equipe não escreve nem altera feedback de aluno: só exclui, escolhendo um motivo de uma lista fechada (lista fechada de propósito: o motivo vai para o log de auditoria, e texto livre ali poderia carregar dado pessoal). Auditoria `FEEDBACK_EXCLUIDO` diz se foi o próprio aluno ou a equipe, com o motivo | `feedbacks.routes.ts`, `feedbacks.service.ts`, `feedbacks.schemas.ts` |
| Reset do 2FA | ADMINISTRADOR reseta o 2FA do aluno que perdeu o celular pelo botão "Resetar 2FA" da tela Participantes: apaga segredo e códigos de recuperação e encerra as sessões da pessoa, que volta a entrar só com a senha (a secretaria vê a coluna 2FA, mas não tem o botão, e a API recusa com `403`). Conta de administrador/secretaria não aparece em nenhuma tela: o reset é pelo script de linha de comando `backend/scripts/resetar-2fa.ts` — o mesmo usado se o único administrador perder o celular e os códigos —, que só funciona com acesso às credenciais de produção e também registra na auditoria | `usuarios.routes.ts`, `ParticipantesPage.tsx`, `backend/scripts/resetar-2fa.ts` |
| Auditoria do 2FA | `MFA_ATIVADO`, `MFA_DESATIVADO`, `MFA_VERIFICADO`, `MFA_FALHA`, `MFA_BLOQUEADO`, `MFA_RESETADO` (com quem resetou, ou "script de emergência"), `CODIGO_RECUPERACAO_USADO` — nenhum registro contém o segredo nem um código | `mfa.service.ts`, `utils/auditoria.ts` |
| Autorização por perfil e por posse | Middleware `autorizar(...)` nega por padrão; toda rota revisada confere perfil e, onde cabe, dono do registro no backend (nunca só no frontend) | Ver `03-matriz-perfis-e-permissoes.md` — cobertura de 100% das rotas |
| Trilha de auditoria | Só o ADMINISTRADOR consulta (`autorizar("ADMINISTRADOR")` em `/api/logs-auditoria`; a secretaria recebe `403` e não tem a aba). Cada operação sensível grava um evento, com uma cópia do nome de quem agiu (`atorNome`) para o registro continuar dizendo quem foi mesmo se a conta sair do sistema. Nenhuma rota edita ou apaga log. O detalhe nunca traz e-mail, RGM, senha, código nem texto livre | `backend/src/utils/auditoria.ts`, `backend/prisma/schema.prisma` (`onDelete: SetNull` na relação com usuário) |
| Cabeçalhos de segurança HTTP | `helmet` em toda resposta da API (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`); `X-Powered-By` removido | `backend/src/expressApp.ts` |
| Limite de tamanho do corpo | `express.json({ limit: "256kb" })`; acima disso a API responde `413 CORPO_MUITO_GRANDE` | `expressApp.ts`, `middleware/errorHandler.ts` |
| E-mails no modelo único | Todos os e-mails saem de um modelo só (`backend/src/modules/email/conteudos-email.ts`): tabelas com CSS inline, 600px, sem imagem nem fonte externa, com preheader e versão em texto puro (campo `text` do SendGrid). Todo dado que vem de pessoa (nome, título, tema, palestrante, sala, link) é escapado antes de entrar no HTML; nenhum e-mail leva senha | `conteudos-email.ts`, `email.service.ts`, `backend/scripts/previa-emails.ts` |
| Logs do servidor sem dado pessoal | O envio de e-mail simulado, o envio suprimido (conta fictícia) e as falhas do SendGrid registram só o tipo do e-mail e a mensagem de erro; falha ao gravar auditoria registra só a ação e o código do erro — nunca destinatário, conteúdo, nome, código ou o objeto de erro bruto | `email.service.ts`, `auth.service.ts`, `utils/auditoria.ts` |
| Contas fictícias nunca recebem e-mail | As contas da carga de demonstração têm `usuarios.ficticio = true` (não aparece em tela nem na API). Antes de qualquer envio, o módulo de e-mail confere se o destinatário é uma conta fictícia e, se for, não envia (o log diz só "envio suprimido (conta fictícia)" e o tipo). Assim a demonstração com volume realista nunca dispara e-mail para endereços inventados | `email.service.ts`, `backend/scripts/carga-demonstracao.ts` |
| Validação na tela e no servidor | Todo formulário marca os campos obrigatórios com `*`, mostra embaixo do campo o que falta (borda vermelha) e leva o foco ao primeiro campo inválido; os erros de validação do backend (`erros: [{ campo, mensagem }]`) aparecem embaixo do campo certo. A validação da tela é só conforto: o backend valida tudo de novo (Zod) | `frontend/src/components/ui/Campo.tsx`, `frontend/src/hooks/useErrosFormulario.ts`, `*.schemas.ts` |
| Consulta parametrizada / ORM | 100% do código de aplicação usa Prisma; não há SQL concatenado com entrada do usuário em rota nenhuma | Todos os `*.service.ts` |
| Segredos fora do código | `ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, `SENDGRID_API_KEY` só existem em variável de ambiente, nunca no repositório (`.gitignore` cobre `.env`/`.env.*`, com exceção proposital de `.env.example`) | `backend/src/config/env.ts` |
| Separação de ambientes | Desenvolvimento e testes usam o banco `SGEA_dev` (outro database no mesmo cluster TiDB); o `.env` local aponta para ele e não tem chave válida do SendGrid, então não envia e-mail real. A conexão de produção fica só em `.env.production.local`, usado para aplicar migration e rodar os scripts de manutenção com `--producao`. Os testes automatizados se recusam a rodar se o banco não for o `SGEA_dev` | `backend/.env.example`, `backend/scripts/testar-*.ts` |
| Backup do banco protegido pelo provedor | TiDB Cloud faz backup automático diário (07:00 UTC) do cluster, com expiração de 1 dia por backup — confirmado no console do provedor | Configuração do provedor, fora do código; documentado em `04-plano-de-retencao-e-descarte.md` |
| Recuperação de senha com limite de tentativas e expiração | Código de 6 dígitos, hash bcrypt (nunca texto puro no banco), validade de 15 minutos, bloqueado após 5 tentativas erradas | `backend/src/modules/auth/auth.service.ts` |
| Mensagens genéricas contra enumeração | Login responde igual para "senha errada", "conta não existe", "conta bloqueada" e "conta da equipe que ainda não usou o convite". "Esqueci a senha" responde o mesmo para e-mail com e sem conta (e para a conta que espera o convite), e a confirmação dá o mesmo `422 CODIGO_INVALIDO`. O convite responde igual para chave inexistente, vencida ou usada. O cadastro avisa "Já existe uma conta com este e-mail" (o aluno precisa saber que já tem conta), com o envio de código limitado por e-mail e por IP | `auth.service.ts`, `professores.service.ts` |
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
| Token em `localStorage`, não em cookie `HttpOnly` | Mais exposto a XSS do que um cookie `HttpOnly`/`Secure`/`SameSite` | Limitação conhecida, sem mudança planejada — mudar exigiria reescrever a camada de sessão |
| 2FA não é exigido de ninguém | Uma conta de equipe sem 2FA ativo depende só da senha | Decisão do projeto: o 2FA é opcional para todos; a recomendação para a equipe é ativar |
| Registros do limite por IP não são apagados | A linha de `limites_acesso` com o IP continua na tabela depois que o bloqueio expira (contador zerado) | Descarte pela rotina de retenção (plano, ver `04`) |
| Sem troca de senha estando logado | A única forma de trocar a senha é o fluxo "Esqueci minha senha", por e-mail | Limitação conhecida |
| Cadastro revela se o e-mail ou o RGM já têm conta | `POST /auth/registro` responde `409` ("Já existe uma conta com este e-mail" / "com este RGM") | Mantido de propósito: o aluno precisa saber que já tem conta. O envio de código é limitado a 5 por e-mail e 20 por IP em 15 min |
| Reaceite dos Termos sem tela | Quando a versão dos Termos mudar (hoje a vigente é a 1), o login vai devolver `precisaAceitarTermos: true` para quem aceitou a anterior e a rota `POST /api/auth/aceitar-termos` registra o novo aceite, mas a tela ainda não pede | Tela de reaceite depois do login, antes da próxima versão dos Termos |
| Cópia de segurança da carga de demonstração | O script de carga salva todos os dados da base apagada em `backend/backups/`, no computador de quem rodou | Fora do repositório (`.gitignore`); apagar o arquivo assim que a carga for conferida (ver `04`) |

## Práticas de desenvolvimento seguro adotadas neste PFC

- Toda migration de banco é aditiva (coluna ou tabela nova) ou documentada
  e aprovada explicitamente antes de aplicar em produção — nunca
  `migrate reset`/`db push` contra o banco real. Migration aditiva é
  aplicada em produção antes do deploy do código que depende dela; a que
  remove ou renomeia é aplicada depois.
- Scripts de manutenção (`resetar-2fa`, `carga-demonstracao`) simulam por
  padrão e só alteram o banco com `--aplicar`; com `--producao`, usam o
  `.env.production.local`. A carga de demonstração salva uma cópia de todas
  as tabelas antes de apagar qualquer coisa e não apaga nada se a cópia
  falhar.
- Testes que escrevem dado rodam contra o banco de desenvolvimento
  (`SGEA_dev`), nunca contra a produção — ver
  `10-evidencias-de-implementacao-e-testes.md` e
  `docs/verificacao-de-requisitos.md`.
