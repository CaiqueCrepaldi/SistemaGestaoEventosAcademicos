# Diagnóstico LGPD — SGEA (Fase 0)

**Data:** 27/09/2026 · **Versão:** 2 (revisado contra o texto integral do
guia e com as decisões da Fase 0 já registradas)

Comparação item a item entre o guia do professor Alessandro Aparecido da
Silva (seções 1 a 7) e o estado real do código, do schema do banco, das
páginas legais e da configuração de deploy do SGEA. Nenhum código foi
alterado para produzir este documento — só leitura (código, schema, `.env`
local sem imprimir segredos, e contagens no banco de produção).

**Migração:** `npx prisma migrate status` → schema em dia, nada pendente
(última aplicada: `20260926120000_auditoria_nome_do_responsavel`, coluna
`atorNomeCifrado` confirmada em produção). Nada a avisar aqui.

**Nota sobre a revisão (v2):** o PDF não chegou a ficar salvo em
`docs/lgpd/referencia/` — a pasta não existe no disco. A comparação abaixo
foi refeita direto contra o texto integral do guia (as seis páginas que
vieram no pedido original, extraídas na íntegra), que é a mesma fonte já
usada na v1. Não achei nenhuma divergência de conteúdo entre o que eu tinha
usado e o texto revisado; a v2 muda por causa das decisões tomadas (seção
"Decisões tomadas") e da checagem explícita dos 9 critérios da seção 7 do
guia (nova seção abaixo). Se você colocar o arquivo `.pdf` de fato em
`docs/lgpd/referencia/` depois, aviso se achar qualquer diferença de texto.

---

## 1. Planejamento antes dos documentos (seção 1 do guia)

| Requisito do guia | Situação | Evidência | Ação proposta |
|---|---|---|---|
| Inventário de tratamento (dado, tela, finalidade, base legal, obrigatoriedade, retenção, acesso, compartilhamento, direitos, resposta a incidente) | Não atende | Não existe nenhum documento assim hoje; a informação está espalhada no código | Fase 1, `01-inventario-e-fluxo-de-dados.md` |
| Finalidade específica (não genérica) | Parcial | `PoliticaDePrivacidadePage.tsx:42-78` já tem uma tabela dado→finalidade→base legal específica, mas fala em "Execução de contrato" para tudo, sem detalhar hipótese por artigo | Refinar por finalidade na Fase 1 (matriz `02`), com o artigo exato |

## 2. Política de Privacidade (seção 2 do guia)

| Requisito | Situação | Evidência | Ação proposta |
|---|---|---|---|
| 2.1 Identificar controlador/operadores, canal funcional | Parcial | `PoliticaDePrivacidadePage.tsx:12-19` explica que numa implantação real o controlador seria a instituição, mas o "canal" hoje é só "fale com a secretaria" (sem endereço, sem SLA, sem existir de fato) | **Decidido** (controlador/operadores/canal — ver "Decisões tomadas" 2 e 3) + página "Meus dados" na Fase 2 |
| 2.2 Dados pessoais tratados | Atende | `PoliticaDePrivacidadePage.tsx:21-40` lista identificação, autenticação, dados acadêmicos, registros de acesso; confere com o schema (`schema.prisma:29-70`) | Só ajustar se a Fase 0 mudar minimização (ex.: telefone de palestrante) |
| 2.3 Finalidades e hipóteses legais (consentimento não deve ser padrão pra tudo) | **Não atende** | Checkbox de cadastro trata aceite de Termos/Política como "consentimento (LGPD)" — `frontend/src/pages/Cadastro/CadastroPage.tsx:149-155` (texto: "Li e aceito... (LGPD)"), e a política também rotula "Execução de contrato" mas mistura com consentimento no feedback (`PoliticaDePrivacidadePage.tsx:70`) | Ver confirmação do ponto (a) abaixo — reclassificar base legal por finalidade |
| 2.4 Compartilhamento e serviços externos | Parcial | Política cita SendGrid e TiDB Cloud (`PoliticaDePrivacidadePage.tsx:80-92`); **não cita a Vercel** (hospeda o backend/frontend, vê toda requisição e IP) | Adicionar Vercel na Fase 1 (`06-fornecedores-e-apis-externas.md`) e na política v2 |
| 2.5 Transferência internacional e cookies | **Não atende** | Nenhuma seção trata de transferência internacional, apesar de TiDB (AWS us-east-1), SendGrid (Twilio, EUA) e Vercel (EUA) estarem todos fora do Brasil. Cookies: não se aplica — o sistema não usa cookie nenhum (token fica em `localStorage`, confirmado em `frontend/src/services/api.ts`) | Adicionar seção de transferência internacional na política v2; documentar ausência de cookies |
| 2.6 Retenção e descarte com critério verificável | **Não atende** | Política diz "enquanto o aluno participa" e "depois de inativada" (`PoliticaDePrivacidadePage.tsx:111-118`) — sem prazo numérico nem rotina que implemente o descarte. Não existe nenhuma rotina de expurgo no código | **Decidido** ("Decisões tomadas" 1) + Fase 2 item 7 (rotina) |
| 2.7 Direitos dos titulares, canal que funcione de verdade | **Não atende** | Política promete acesso/correção/exclusão "pela secretaria" (`PoliticaDePrivacidadePage.tsx:120-127`), mas no sistema só existe `GET /api/usuarios/me` (`backend/src/modules/usuarios/usuarios.routes.ts:12-20`). Não há exportação, correção, exclusão, oposição, nem revisão de decisão automatizada | Fase 2 item 6 — página "Meus dados" + tabela de solicitações |
| 2.8 Segurança, incidentes, versão/data | Parcial | Seção 6 da política descreve medidas em nível geral (bom, sem detalhe explorável); seção 9 fala de incidentes em termos genéricos, sem processo nem prazo à ANPD. Versão/data existem (`legal-versao`, "Versão 1 — 25/09/2026") | Fase 1 `05-plano-de-resposta-a-incidentes.md` + política v2 |

## 3. Termos de Uso (seção 3 do guia)

| Requisito | Situação | Evidência | Ação proposta |
|---|---|---|---|
| Descrição/finalidade/limitação do serviço | Atende | `TermosDeUsoPage.tsx:11-18` | — |
| Quem pode usar, idade/representação | Parcial | Diz que o cadastro exige e-mail `@alunos.umc.br` (`TermosDeUsoPage.tsx:20-25`), mas **não trata idade mínima nem representação** (o guia pede isso explicitamente) | **Decidido** ("Decisões tomadas" 5) — declaração de maioridade/representação no aceite |
| Conta, papéis, permissões, condutas proibidas | Atende | `TermosDeUsoPage.tsx:27-42` | — |
| Encerramento de conta | Parcial | Fala em inativação → exclusão definitiva "que remove permanentemente o histórico" (`TermosDeUsoPage.tsx:64-69`) — mesma tensão do ponto (j)/decisão de anonimização | **Decidido** ("Decisões tomadas" 4 — anonimização, não hard delete) |
| Não pode transferir toda a responsabilidade ao usuário nem autorizar uso futuro genérico | Atende | Não há cláusula desse tipo hoje | — |
| Versão/data | Atende | "Versão 1 — 25/09/2026" | Vira v2 junto com a política |

## 4. Requisitos técnicos mínimos (seção 4 do guia)

### 4.1 Minimização

| Item | Situação | Evidência |
|---|---|---|
| Aluno: nome, e-mail, RGM — todos necessários (login, matrícula, certificado) | Atende | `schema.prisma:53-70` |
| Palestrante: nome, e-mail, **telefone** em texto puro | **Questionável** | `schema.prisma:81-89` (`email String @unique`, `telefone String`, sem `@db.Text`/cifra). Telefone não aparece usado em nenhum fluxo automatizado (nem e-mail nem SMS) — grep em `backend/src` não encontra leitura de `palestrante.telefone` fora do CRUD e do DTO | **Ainda em aberto** — não veio nas decisões da Fase 0. Proposta padrão pra Fase 1/2, a confirmar: manter o campo (é usado pra contato humano direto da secretaria com o palestrante) mas cifrar como os demais dados pessoais, e documentar a finalidade específica na matriz |
| Sem CPF, endereço, nascimento, foto, dado de saúde | Atende | Confirmado no schema inteiro | — |

### 4.2 Autenticação

| Item | Situação | Evidência |
|---|---|---|
| Hash forte + salt | Atende | `backend/src/utils/password.ts` — bcrypt, custo 10 |
| Nunca senha em texto puro nem em log | Atende | Grep de `console.` em `backend/src` não mostra nenhuma senha sendo logada |
| Token temporário e de uso único na recuperação | Parcial | Código de 6 dígitos com hash bcrypt, validade 15min, invalidado após uso (`usadoEm`) — `auth.service.ts:135-171,205-210`. **Mas** um novo pedido não invalida o código anterior ainda válido (dois códigos podem ficar valendo ao mesmo tempo) | Fase 2 pequeno ajuste opcional (invalidar pendente ao gerar novo) |
| Limitar tentativas (login) | **Não atende** | Login não bloqueia após N falhas — só grava `LOGIN_FALHA` na auditoria (`auth.service.ts:97-100`), sem contagem nem bloqueio temporário. Recuperação de senha já tem limite (5 tentativas de código, `MAX_TENTATIVAS_CODIGO`), mas login não |
| Invalidar sessões (troca de senha/inativação/exclusão) | **Não atende** | JWT não tem campo de versão; `verificarToken` (`backend/src/utils/jwt.ts:21-23`) só confere assinatura/expiração. Trocar senha, inativar ou excluir conta **não** derruba tokens já emitidos — continuam válidos até expirar (até 8h) |
| HTTPS em produção | Atende (nível de plataforma) | Vercel força HTTPS por padrão; não há nada no Express que dependa de HTTP puro |
| Cookies de sessão (Secure/HttpOnly/SameSite) | Não se aplica | Não há cookie de sessão — token fica em `localStorage` (decisão de arquitetura já existente, fora do escopo deste guia sobre cookies, mas vale registrar o trade-off: `localStorage` é mais exposto a XSS que um cookie HttpOnly) |
| Multifator em contexto de maior risco | Não atende | Não existe MFA em nenhum perfil | Fora de escopo proposto para o PFC — registrar como limitação conhecida em `07-medidas-tecnicas-de-seguranca.md`, não implementar agora |

### 4.3 Autorização por perfil

Revisão de **todas** as rotas do backend (`backend/src/modules/*/*.routes.ts`):

| Módulo | Situação | Evidência |
|---|---|---|
| Salas, Palestrantes (escrita), Participantes, Auditoria | Atende — nega por padrão | `autorizar("ADMINISTRADOR","SECRETARIA")` em todas as rotas de escrita/leitura sensível |
| Eventos (escrita) | Atende | idem |
| Inscrições | Atende — ALUNO nunca lê/edita de outro | `inscricoes.routes.ts:17-20` ignora `participanteId` da query se for ALUNO; `PUT`/`DELETE` são admin/secretaria only; `POST /:id/confirmacao-email` confere posse (`inscricoes.service.ts`) |
| Feedbacks | Atende — ALUNO só cria/edita/lê o próprio | `feedbacks.routes.ts:26,54,68-70,101` — `participanteId` do corpo é ignorado pro aluno, sempre usa o do token |
| Questionário/tentativas | Atende — sem ranking exposto ao aluno | Aluno só vê a própria tentativa (`eventos.routes.ts:113-125`, usa `participanteId` do token, sem parâmetro na URL); `GET /questionario-tentativas` (todas as tentativas, de todos os alunos) é `ADMINISTRADOR`/`SECRETARIA` only (`questionario.routes.ts:11-19`) — não vira ranking pro aluno |
| Ninguém define o próprio perfil | Atende hoje | Não existe nenhum endpoint de auto-edição de perfil ainda — mas isso muda na Fase 2 (página "Meus dados"), então vira um requisito a **garantir** no novo endpoint, não um problema atual |
| Certificado (client-side) | Atende (dado não sensível de terceiro) | PDF gerado no navegador a partir de dados que já pertencem ao próprio aluno logado |

Conclusão: a autorização por perfil e por posse já está bem implementada em
todo o backend hoje. O risco real está em (i) não haver bloqueio de força
bruta, e (ii) tokens não serem revogáveis — não em vazamento de dado entre
usuários.

### 4.4 Banco, dados, arquivos e segredos

| Item | Situação | Evidência |
|---|---|---|
| ORM / consultas parametrizadas | Atende | Prisma em 100% do código de aplicação; os poucos `$queryRawUnsafe` que existiram foram só em scripts de migração pontuais, não em rota alguma |
| Validar propriedade dos registros | Atende | Ver seção 4.3 |
| **Separar dev/teste/produção** | **Não atende** | `backend/.env` local aponta para o **mesmo banco de produção** (`gateway01.us-east-1.prod.aws.tidbcloud.com/SGEA`) — confirmado agora mesmo, só lendo o host, sem imprimir credencial. Isso é o oposto do que o guia pede em 4.4 e no critério de avaliação ("usar dados reais... em testes") |
| Não usar dado real de aluno em teste | Parcial | Nas sessões anteriores adotei a prática de rodar testes de escrita contra um MySQL local descartável (não documentada no repo, só na minha memória de sessão) — mas nada no projeto **força** isso; é fácil rodar `npm run dev` e testar contra produção sem querer (aliás, é o que a própria instrução do professor pede evitar) |
| Proteger backups, documentar migrações | Parcial | Migrações do Prisma existem e são versionadas (`backend/prisma/migrations/`); backup do banco é gerido pelo TiDB Cloud (fora do controle do código) — precisa só ser **documentado**, não implementado |
| Chaves fora do código/GitHub | Atende | `.env`/`.env.*` no `.gitignore`; `ENCRYPTION_KEY`/`JWT_SECRET`/`SENDGRID_API_KEY` nunca aparecem no repo (grep confirma) |
| Criptografar dado sensível | Parcial | `nome`/`email`/`rgm` de `Usuario` e `Participante` cifrados (AES-256-GCM + índice HMAC, `backend/src/utils/criptografia.ts`); **palestrante não** (ver 4.1) |

### 4.5 Logs, auditoria e direitos

| Item | Situação | Evidência |
|---|---|---|
| Registrar login/falha/permissão/acesso admin/exportação/mudança crítica | Atende (menos exportação, que ainda não existe) | `logs_auditoria` cobre login, `ACESSO_NEGADO`, toda escrita em sala/palestrante/evento/participante/inscrição/feedback/questionário — ver `backend/src/utils/auditoria.ts:5-37` para a lista de ações |
| Nunca gravar senha/token/documento sensível no log | Atende | `detalhe` sempre id + campo alterado, nunca valor — conferido em cada `registrarAuditoria(...)` do código |
| Procedimento pra localizar/corrigir/exportar/restringir/excluir/anonimizar e registrar o atendimento | **Não atende** | Não existe nada disso ainda — nem endpoint, nem tabela de solicitações |

### 4.6 Plano de retenção

**Não atende** — não existe nenhuma rotina de expurgo, para nenhuma categoria.
Situação atual por categoria (o que o código faz hoje, sem nenhum critério de
tempo):

| Categoria | O que existe hoje |
|---|---|
| Conta (Usuario/Participante) | Fica para sempre, até alguém inativar manualmente e depois excluir manualmente (hard delete) |
| Logs de auditoria | Nunca são apagados — nem manualmente (proibido pela regra do projeto), nem por rotina (não existe) |
| Códigos de recuperação de senha expirados | Ficam na tabela `recuperacoes_senha` para sempre, mesmo vencidos/usados |
| Dados de demonstração (seed, `[TESTE]`) | Ficam até alguém apagar manualmente; existe hoje um lote real criado numa tarefa anterior (`backend/dados-teste.local.md`, não commitado) ainda no banco |
| Consentimentos (`consentimentoLgpdEm`) | Fica atrelado ao próprio `Usuario`, não tem vida própria — se o usuário for excluído, a prova do consentimento some junto |

Ação: decisões de prazo em "Decisões tomadas" (seção 1) + rotina na Fase 2.

### 4.7 Resposta a incidentes

**Não atende** — não existe processo escrito nem papel definido. Vira
`05-plano-de-resposta-a-incidentes.md` na Fase 1 (puramente documentação,
baseada no que a arquitetura atual permite fazer: `logs_auditoria` para
investigar, `descriptografar()` para restrito administrador confirmar quais
registros foram afetados).

## 5. Cuidados específicos por área (seção 5 do guia)

| Área | Aplica ao SGEA? | Observação |
|---|---|---|
| 5.1 Educação | **Sim** | É o caso central do sistema — perfis separados (atende), mas falta o cuidado de auditar quem altera nota/presença com o dado *de quem* mudou visível só à equipe (hoje audita, mas não expõe "ranking" a ninguém — já atende) |
| 5.2 Crianças e adolescentes | Não se aplica na prática | Cadastro exige e-mail institucional de graduação; não há campo de idade nem fluxo pensado pra menor. Precisa virar decisão explícita (exigir maioridade nos Termos) em vez de só "não se aplica" |
| 5.3 Saúde/odontologia/bem-estar | Não se aplica | Sistema não trata dado clínico |
| 5.4 Finanças | Não se aplica | Sistema não trata dado financeiro |
| 5.5 Presença, imagem, voz, biometria | Parcial | Há "presença" (check-in), mas é so um booleano com data/hora e quem confirmou — não é biometria nem imagem/voz. Nenhuma captura de imagem/voz/biometria existe no sistema |
| 5.6 Inteligência artificial | Não se aplica | O sistema **não envia dado pessoal a nenhuma IA** — certificado é gerado localmente (jsPDF, sem chamada externa), questionário é corrigido no próprio backend. Vale documentar isso explicitamente em `09-avaliacoes-especificas.md` como uma afirmação verificável (nenhuma dependência de IA no código) |

## 6. Entregáveis e 7. Critérios de avaliação

Lista de entregáveis (seção 6) coberta pela Fase 1 (um arquivo por item) e
pela Fase 3 (evidências). Os 9 pontos que o guia lista como "não será
considerado suficiente" (seção 7), verificados um a um contra o código
atual:

| Critério do guia | Situação do SGEA hoje |
|---|---|
| Copiar uma política genérica ou declarar conformidade sem demonstrar | Atende — `PoliticaDePrivacidadePage.tsx` já é específica do sistema (seção 2 acima), não é texto de modelo |
| Usar consentimento obrigatório para todo tratamento | **Não atende hoje** — é exatamente o ponto (a): o checkbox trata tudo como "consentimento (LGPD)". Corrigido na Fase 2 |
| Esconder funções apenas no frontend | Atende — seção 4.3 acima confirma checagem no backend em toda rota revisada |
| Armazenar senha em texto puro ou versionar chave de API | Atende — bcrypt (seção 4.2); `.env`/chaves fora do git (seção 4.4) |
| Usar dados reais de aluno/paciente em testes | **Não atende plenamente** — banco de dev/teste não é separado do de produção (seção 4.4). Corrigido na Fase 2 item 8 |
| Manter dado indefinidamente ou prometer exclusão sem implementar | **Não atende hoje** — política promete exclusão que não é implementada como retenção automática (seção 2.6/4.6). Corrigido nas decisões de retenção + Fase 2 item 7 |
| Utilizar IA sem informar o envio dos dados | Não se aplica — sistema não usa IA em nenhum ponto (seção 5.6) |
| Transferir ao usuário toda a responsabilidade pela segurança | Atende — nenhuma cláusula desse tipo nos Termos (seção 3) |
| Confundir Termos de Uso com Política de Privacidade | Atende — são dois documentos/páginas separados, com escopos distintos |

---

## Serviços externos que recebem dado pessoal ou IP do usuário

| Serviço | O que recebe | País | Confirmado no código |
|---|---|---|---|
| **TiDB Cloud** (banco de dados) | Todos os dados pessoais tratados pelo sistema (cifrados os campos sensíveis) | EUA (AWS us-east-1) | `backend/.env` (host), `schema.prisma` |
| **SendGrid** (Twilio) | E-mail do destinatário + nome do aluno + conteúdo da mensagem (código de recuperação, confirmação de inscrição) | EUA | `backend/src/modules/email/email.service.ts` |
| **Vercel** | IP de origem de toda requisição, cabeçalhos HTTP, e por consequência todo o tráfego da API (já que é quem executa a função serverless) | EUA | `vercel.json`, deploy do projeto — **hoje não mencionado na política** |

Não encontrado no frontend: nenhum CDN de fonte, nenhum script de analytics,
nenhum SDK de terceiro carregado no navegador (`frontend/index.html` só
carrega `main.tsx`; `package.json` do frontend só tem `react`,
`react-dom`, `react-router-dom` e `jspdf` — nenhum deles faz chamada de
rede a terceiros). `jsPDF` roda 100% no navegador do próprio aluno, sem
enviar nada a lugar nenhum.

**Não confirmado (preciso que você verifique no painel da Vercel):**
`SENDGRID_API_KEY`/`EMAIL_FROM` estão definidos no `backend/.env` local, mas
não sei se estão configurados nas variáveis de ambiente de **produção** na
Vercel. Não há nenhum log `EMAIL_ENVIADO`/`EMAIL_FALHA` na tabela
`logs_auditoria` até agora (contei: zero), então não dá pra confirmar por
uso real. Se não estiverem configurados em produção, o ponto (g) abaixo não
é uma possibilidade teórica — está acontecendo agora, toda vez que alguém
usa "esqueci a senha" em produção.

## Console.log/console.error com dado pessoal, senha, código ou token

| Arquivo:linha | O que loga | Risco |
|---|---|---|
| `backend/src/modules/email/email.service.ts:14` | E-mail do destinatário **e o HTML inteiro** (que contém o código de recuperação de senha em texto puro) — só quando SendGrid não está configurado | **Alto**: se acontecer em produção (ver acima), o código de recuperação de qualquer conta fica visível pra quem tiver acesso aos logs da função na Vercel |
| `backend/src/modules/auth/auth.service.ts:165` | `console.error("[recuperacao-senha] falha ao enviar e-mail:", erro)` — o objeto de erro do SendGrid, que em geral **ecoa o corpo da requisição enviada** (inclui o e-mail do destinatário) | Médio: só ocorre em falha de envio, mas o SDK do SendGrid costuma incluir o payload no erro |
| `backend/src/middleware/errorHandler.ts:14` | `{ code, meta, message }` de erro do Prisma — `meta` costuma trazer só nome de coluna/índice (ex.: `target: ["emailLoginHash"]`), não o valor; `message` do Prisma normalmente não inclui o dado, mas não é 100% garantido em todo tipo de erro | Baixo, mas vale revisão pontual |
| `backend/src/middleware/errorHandler.ts:45` | Stack trace completo de qualquer erro não tratado | Baixo/médio — depende do que causou o erro; um erro de validação, por exemplo, não carrega PII no stack, mas não é garantido em geral |
| `backend/src/utils/auditoria.ts:59` | Só o erro de falha ao gravar log (nunca o conteúdo do log em si) | Baixo |
| `backend/src/main.ts:12-18` | Só mensagens fixas de start/stop do servidor | Nenhum |

Ação proposta pra todos os itens "Alto"/"Médio": Fase 2 item 4 — remover o
`console.info` com o HTML completo (trocar por um log sem o código/sem o
destinatário) e higienizar o `console.error` da falha de envio (logar só
`erro.message`, nunca o objeto inteiro do SDK).

---

## Confirmação dos pontos que você já tinha identificado

**a) Base legal.** Confirmado — o checkbox de cadastro (`CadastroPage.tsx:149-155`)
e o backend (`auth.schemas.ts:22`, campo literalmente chamado `aceiteLgpd`)
tratam a aceitação dos Termos/Política como um "consentimento" genérico.
Proposta de base por finalidade:

| Finalidade | Base legal proposta | Artigo |
|---|---|---|
| Criar e autenticar conta, matrícula (nome/e-mail/RGM/senha) | Execução de contrato / procedimento preliminar a pedido do titular (o próprio aluno pede o cadastro) | Art. 7º, V |
| Inscrição em evento, controle de vaga, check-in, liberação de questionário/certificado | Execução de contrato | Art. 7º, V |
| Feedback de palestra | Consentimento (é opcional, é uma manifestação extra que não é necessária pro serviço em si) | Art. 7º, I |
| Logs de login/segurança/auditoria | Legítimo interesse em segurança da informação, e também cumprimento de obrigação legal onde a LGPD/boas práticas exigem rastreabilidade | Art. 7º, IX e II |
| Aceite de Termos de Uso e ciência da Política de Privacidade | **Não é consentimento de tratamento de dado** — é a formalização contratual de uso do serviço. Deve ser tratado e nomeado como tal (ver Fase 2 item 2: trocar o texto do checkbox) | — |

**b) Decisão automatizada.** Confirmado — `questionario.service.ts` libera o
certificado sozinho (`atingiuNotaMinima`, sem revisão possível). Hoje não
existe nenhum jeito de o aluno contestar/pedir revisão. Precisa de um canal
(Fase 2 item 6).

**c) Direitos do titular.** Confirmado — só `GET /api/usuarios/me`. Nada de
exportação, correção, exclusão, oposição ou registro de solicitação.

**d) Login/sessão.** Confirmado — sem limite de tentativas de login (só a
recuperação de senha tem limite) e sem invalidação de sessão ao trocar
senha/inativar/excluir/mudar perfil.

**e) Retenção.** Confirmado — nenhuma rotina de expurgo existe hoje, pra
nenhuma categoria (ver tabela da seção 4.6 acima).

**f) Palestrantes.** Confirmado — nome/e-mail/telefone em texto puro no
banco (`schema.prisma:81-89`). Telefone não é usado em nenhum fluxo
automatizado hoje (grep não encontra leitura fora do CRUD/DTO) — candidato
a virar opcional ou remover; se ficar, precisa ser cifrado como os campos
do aluno.

**g) Log de e-mail em produção.** Confirmado como risco estrutural do
código (existe hoje, independente de o SendGrid estar configurado ou não em
produção neste exato momento — ver "não confirmado" acima).

**h) Vercel e transferência internacional.** Confirmado — a política atual
(v1) cita SendGrid e TiDB, mas não cita a Vercel nem trata explicitamente
de transferência internacional.

**i) Mesmo banco em dev e produção.** Confirmado — `backend/.env` local
aponta pro mesmo TiDB de produção (host conferido agora, sem expor
credencial).

**j) Logs imutáveis vs. prazo/eliminação.** Confirmado — a regra do projeto
(logs nunca são apagados manualmente) e a cópia permanente do nome em
`atorNomeCifrado` colidem em cheio com "prazo definido" (guia 4.6) e com
qualquer pedido de eliminação de dado pessoal via log. Isso **precisa** de
uma decisão sua (seção abaixo) — não dá pra resolver só no código sem
definir a regra primeiro.

---

## Decisões tomadas (27/09/2026)

Registradas aqui como referência única pro resto da documentação (Fase 1) e
pra implementação (Fase 2). Onde a decisão mudou minha recomendação
original, a mudança está marcada.

### 1. Prazos de retenção

| Categoria | Decisão |
|---|---|
| Conta ativa | Enquanto ativa (sem prazo) |
| Conta sem login há 24 meses | Anonimizada automaticamente pela rotina de retenção (**muda da minha recomendação de "90 dias inativada"** — o critério agora é tempo sem login, não status manual de inativação) |
| Exclusão a pedido do titular, ou pela equipe | Anonimização imediata ao confirmar — e o fluxo da equipe segue exatamente as mesmas regras (decisão 4) |
| Inscrições, presenças, certificados | Mantidos enquanto a conta existir; na exclusão/anonimização perdem o vínculo pessoal e ficam só para estatística. **Antes de confirmar a exclusão, o sistema avisa o aluno para baixar os certificados** (novo requisito de UX pra Fase 2) |
| Feedbacks | Na exclusão, mantém a nota e **apaga** o texto do comentário (texto livre pode identificar a pessoa) — diferente das inscrições, que só perdem o vínculo; aqui o próprio conteúdo some |
| Códigos de recuperação de senha | Excluídos 24h após expirar ou ser usado |
| Logs de auditoria | **5 anos**, removidos só pela rotina automática. Base legal: exercício regular de direitos (LGPD art. 7º, VI) e prazo do art. 27 do CDC (relação aluno–UMC é de consumo) — **não** Código Civil, como eu tinha proposto por engano na v1. Na exclusão da conta, `atorNomeCifrado` é anonimizado e o evento do log continua existindo |
| Registro de aceite (Termos/Política) | Mantido pelo mesmo prazo dos logs (5 anos), sem dado pessoal além do id pseudonimizado |
| Dados de demonstração (`[TESTE]`) | Excluídos até 31/12/2026 (após a apresentação do PFC), pelo script de limpeza |
| Backups do TiDB Cloud | Documentar a retenção real (conferir na documentação oficial do TiDB Cloud) e deixar explícito que dado excluído/anonimizado no banco principal ainda existe nos backups até a rotação deles — vai pro `04-plano-de-retencao-e-descarte.md` |

### 2. Canal de privacidade

- **Canal principal:** a página "Meus dados" dentro do sistema — solicitação
  registrada e atendida pela própria equipe (Fase 2 item 6).
- **E-mail:** `privacidade@sgeacademicos.com.br`, usado na documentação como
  canal alternativo. Você mesmo vai configurar o redirecionamento.
- **Pendência minha:** te lembrar, no fim do trabalho, de testar se esse
  endereço recebe mensagem de verdade antes de publicar a política v2 com
  ele.

### 3. Controlador, operadores e encarregado

- **Implantação real:** controladora = Universidade de Mogi das Cruzes;
  encarregado = o encarregado institucional da UMC (sem nome de pessoa).
- **Protótipo acadêmico:** responsáveis = Caique Crepaldi e João Pedro
  Rachid de Abreu (equipe do PFC).
- **Operadores:** Vercel, TiDB Cloud e SendGrid (Twilio).
- **Prof. Bruno Messias Aguiar:** aparece só como orientador do projeto —
  nunca como controlador, encarregado ou responsável pelos dados, em
  nenhum documento.

### 4. Exclusão = anonimização (aluno e equipe)

Concordado: anonimizar em vez de apagar de vez, tanto quando é o próprio
titular que pede quanto quando é a secretaria/administrador que executa —
**mesmo fluxo, mesmas regras da decisão 1**, e a exclusão feita pela equipe
passa a registrar na auditoria quem foi o responsável por acionar.
Continua valendo o desenho técnico já proposto na v1 deste diagnóstico:
`Participante`/`Usuario` recifrados com valor irreversível,
`Inscricao`/`Feedback`/`TentativaQuestionario` mantidos mas
desvinculados/com o comentário apagado (decisão 1), `LogAuditoria` com
`usuarioId` já nulo (`SetNull`) e `atorNomeCifrado` anonimizado. É uma
mudança de comportamento em relação ao hard delete de hoje
(`participantes.service.ts:124-130`) e ao texto da política v1
(`PoliticaDePrivacidadePage.tsx:114-117`, "apaga... de forma permanente") —
corrigido nas Fases 1 e 2.

### 5. Idade e representação

- **Não coletar data de nascimento** (minimização — confirma o que já era
  padrão do sistema).
- Nos Termos de Uso e no aceite do cadastro, incluir a declaração: **"Tenho
  18 anos ou mais, ou tenho autorização do meu responsável legal."**
- Em `09-avaliacoes-especificas.md`, explicar que o sistema é destinado a
  alunos de graduação e não coleta dado adicional de menor de idade.

---

## Próximos passos

Fase 0 encerrada. Segue para a Fase 1 (documentação em `docs/lgpd/`), já
com as decisões acima incorporadas. A Fase 2 (implementação) só começa
depois que a Fase 1 estiver pronta e revisada.
