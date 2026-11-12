# Backend — Sistema de Gestão de Eventos Acadêmicos

API REST em **Node.js + TypeScript + Express**. Implementa exatamente o
contrato documentado em [`../docs/api-contract.md`](../docs/api-contract.md)
— é a referência oficial de rotas, formatos de request/response e regras
de autorização por perfil; este README é só sobre como rodar o projeto
localmente.

## Sobre o banco de dados

Os dados ficam num banco **TiDB Cloud** (compatível com o protocolo MySQL,
acessado via **Prisma** com `provider = "mysql"`). O schema completo
(tabelas, relacionamentos, chaves estrangeiras) está em
[`prisma/schema.prisma`](prisma/schema.prisma).

Toda a lógica que mexe nos dados fica isolada em `src/db/prisma.ts`
(instância única do cliente) — os módulos em `src/modules/` só chamam
`prisma.<entidade>.<operação>()`, nunca SQL cru.

## Stack

- **Express** — servidor HTTP e roteamento.
- **Prisma + TiDB (MySQL)** — persistência dos dados.
- **Zod** — validação de corpo de requisição.
- **jsonwebtoken** + **bcryptjs** — autenticação (JWT) e hash de senha.
- **SendGrid** — envio de e-mail (confirmação de inscrição, código de
  recuperação de senha). Sem `SENDGRID_API_KEY` configurada, só imprime no
  console — não precisa de conta no SendGrid pra testar em dev.
- **tsx** — roda TypeScript direto em dev, sem passo de build manual.

## Passo a passo pra rodar localmente

### 1. Banco de dados

Crie um cluster grátis no [TiDB Cloud](https://tidbcloud.com/) (Serverless)
e pega a connection string na aba "Connect" (escolhe "Prisma" no seletor de
formato, ele já monta a `DATABASE_URL` certa). As tabelas quem cria é o
Prisma Migrate no passo 3 — não precisa criar nada na mão.

### 2. Variáveis de ambiente

Copie o `backend/.env.example` para `backend/.env` (o `.env` não é
versionado, ver `.gitignore`) e troque todo valor que tem `TROQUE`:

```bash
cp .env.example .env
```

O que cada variável faz, quais são obrigatórias e como gerar os segredos
está na seção [Variáveis de ambiente](#variáveis-de-ambiente), mais abaixo.
O servidor não sobe se faltar uma obrigatória ou se ela ainda estiver com o
valor de exemplo.

**Trocar a `ENCRYPTION_KEY` torna ilegível todo dado já cifrado com a
antiga (o 2FA de todo mundo para de funcionar) — guarde-a com o mesmo
cuidado que o `JWT_SECRET`, nunca a perca.**

Pra enviar de verdade: cria conta grátis em
[sendgrid.com](https://signup.sendgrid.com/) (100 e-mails/dia de graça),
verifica um e-mail próprio em **Settings → Sender Authentication → Single
Sender Verification** (não precisa de domínio, só confirmar um link
mandado pra essa caixa), gera uma API key em
[app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys)
e preenche `SENDGRID_API_KEY` com a chave e `EMAIL_FROM` com **exatamente**
o e-mail verificado (o SendGrid recusa qualquer outro remetente).

### 3. Instalar, migrar e popular

```bash
cd backend
npm install
npm run db:migrate   # cria as tabelas no banco (pede um nome pra migration, ex: init)
npm run db:seed      # popula com os dados de demonstração (precisa das SEED_*_SENHA no .env)
npm run dev
```

API disponível em `http://localhost:8080/api` (porta configurável via
`PORT` no `.env`). `GET /health` (fora do prefixo `/api`) serve só pra
conferir que o processo subiu.

### Apontar o frontend pra essa API

Copie o `frontend/.env.example` para `frontend/.env` se precisar mudar o
endereço da API (sem ele, o frontend usa `http://localhost:8080/api`):

```
VITE_API_URL=http://localhost:8080/api
```

As contas de demonstração são criadas pelo seed, só no banco de
desenvolvimento:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | o e-mail de `SEED_ADMIN_EMAIL` (sem ela, admin@umc.br) | a de `SEED_ADMIN_SENHA` no seu `backend/.env` |
| Secretaria | secretaria@umc.br (sem envio de e-mail) | a de `SEED_SECRETARIA_SENHA` |
| Professor | professor@umc.br (sem envio de e-mail) | a de `SEED_PROFESSOR_SENHA` (conta já ativada, sem convite) |

Não há conta de aluno de demonstração: os alunos, professores, salas,
palestrantes e eventos de exemplo vêm da carga de demonstração
(`scripts/carga-demonstracao.ts`), em contas fictícias que nunca recebem
e-mail.

Nenhuma senha fica no código nem na documentação. O seed nunca muda a senha
de uma conta que já existe: num banco populado antes, as contas continuam
com a senha que tinham. Para definir uma senha nova numa conta que já
existe, use o script `scripts/definir-senha.ts` (ver "Scripts disponíveis").

## Variáveis de ambiente

Local: `backend/.env`, copiado do `backend/.env.example`. Produção: painel
da Vercel (**Settings → Environment Variables**), nunca no repositório.
O frontend tem o seu, `frontend/.env.example`, com só a `VITE_API_URL`.

| Variável | Obrigatória? | Para que serve |
|---|---|---|
| `DATABASE_URL` | **Sim** | Conexão com o banco (TiDB Cloud, formato "Prisma"). Em dev, o `SGEA_dev`; nunca o de produção |
| `JWT_SECRET` | **Sim** | Assina o token de login. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Trocar derruba todas as sessões |
| `ENCRYPTION_KEY` | **Sim** | Chave AES-256 (base64 de exatamente 32 bytes) do segredo do 2FA e dos HMAC. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Nunca trocar depois que houver 2FA ativo |
| `PORT` | Não (padrão `8080`) | Porta do servidor local; número inteiro |
| `NODE_ENV` | Não (padrão `development`) | `production` só na Vercel: aí o `codigoDemo` e o `linkConviteDemo` nunca voltam na resposta |
| `CORS_ORIGIN` | Não (padrão `http://localhost:5173`) | Endereço do frontend que pode chamar a API |
| `JWT_EXPIRES_IN` | Não (padrão `8h`) | Duração da sessão: `8h`, `30m`, `1d` ou o número de segundos |
| `SENDGRID_API_KEY` | Não | Chave do SendGrid (começa com `SG.`). Sem ela, os e-mails ficam simulados |
| `EMAIL_FROM` | Não | Remetente verificado no SendGrid; vai junto com a chave |
| `APP_URL` | Não para subir; **sim** para criar professor | Endereço do frontend, sem barra no fim (dev: `http://localhost:5173`; produção: o domínio do site, na Vercel). Vai no link do convite do professor (`APP_URL/#/primeiro-acesso?convite=...`). Sem ela, o servidor avisa na inicialização e criar professor e reenviar convite são recusados |
| `SEED_ADMIN_EMAIL` | Não (no `.env.production.local`, sim para a carga em produção) | E-mail da conta de administrador de demonstração: o de quem apresenta, que recebe os avisos. Fica só no `.env`, nunca no código. Sem ela: `admin@umc.br` |
| `SEED_ADMIN_SENHA` | Só para o seed e a carga | Senha da conta de administrador de demonstração |
| `SEED_SECRETARIA_SENHA` | Só para o seed e a carga | Senha da conta `secretaria@umc.br` |
| `SEED_PROFESSOR_SENHA` | Só para o seed e a carga | Senha da conta `professor@umc.br` (já ativada) |

**O servidor não sobe** se `DATABASE_URL`, `JWT_SECRET` ou `ENCRYPTION_KEY`
estiver ausente, vazia ou ainda com o valor de exemplo (qualquer valor com
"troque"), se a `ENCRYPTION_KEY` não tiver 32 bytes, se a `PORT` não for um
número inteiro ou se o `JWT_EXPIRES_IN` estiver num formato inválido. A
mensagem diz o nome da variável e o que fazer, nunca o valor
(`src/config/env.ts`).

**E-mail:** sem `SENDGRID_API_KEY` e `EMAIL_FROM` válidos (vazios, com
valor de exemplo ou chave sem `SG.`), o servidor sobe com um aviso e os
e-mails ficam simulados: o log só diz o tipo do e-mail, sem destinatário nem
conteúdo. Em produção esse aviso é um erro, porque sem e-mail o cadastro de
aluno não funciona (o código de confirmação não chega).

**Convite do professor:** sem `APP_URL` válida (vazia, com valor de exemplo,
formato inválido ou `localhost` em produção), o servidor sobe com um aviso
(erro no log, em produção) e criar professor e reenviar convite respondem
"O endereço do sistema não está configurado; não é possível enviar o
convite."

**Seed:** `SEED_ADMIN_SENHA` e `SEED_SECRETARIA_SENHA` são obrigatórias para
o `npm run db:seed`, e toda senha precisa seguir a regra de senha do sistema
(8 a 64 caracteres, com maiúscula, número e caractere especial). Se faltar
alguma ou ela estiver fora da regra, o seed para antes de gravar qualquer
coisa.

## Implantação em produção: dados pessoais sem duplicação (migration de 03/11/2026)

A migration `20261103150000_dados_pessoais_sem_duplicacao` tira as cópias de
nome/e-mail/RGM entre `usuarios` e `participantes` e os índices de busca da
época da criptografia. Ela **só pode ser aplicada depois que nenhum registro
antigo estiver cifrado** — senão quem tem cadastro antigo não consegue mais
entrar. Siga a ordem:

1. **Backup** (SQL Editor do TiDB Cloud, database `SGEA`; o TiDB não aceita
   `CREATE TABLE ... AS SELECT`, por isso `LIKE` + `INSERT`):
   ```sql
   CREATE TABLE usuarios_bkp_20261103 LIKE usuarios;
   INSERT INTO usuarios_bkp_20261103 SELECT * FROM usuarios;
   CREATE TABLE participantes_bkp_20261103 LIKE participantes;
   INSERT INTO participantes_bkp_20261103 SELECT * FROM participantes;
   CREATE TABLE logs_auditoria_bkp_20261103 LIKE logs_auditoria;
   INSERT INTO logs_auditoria_bkp_20261103 SELECT * FROM logs_auditoria;
   ```
2. **Conversão dos registros antigos.** A `ENCRYPTION_KEY` de produção só
   existe na Vercel (variável Secret, ninguém consegue ler o valor), então a
   conversão roda dentro do servidor, pela rota temporária
   `POST /api/manutencao/conversao-dados-pessoais` (commit `3ef98dd`, só
   ADMINISTRADOR). Publique essa versão (merge da branch
   `conversao-dados-pessoais` na `main`) e, logado como administrador, chame a
   rota três vezes:
   - corpo `{}` → simulação: `situacao: "SIMULACAO"`, com `falhas` e
     `indiceNaoConfere` zerados em tudo (se vier `BLOQUEADA_POR_PROBLEMAS`,
     pare: nada foi gravado);
   - corpo `{ "aplicar": true, "confirmoBackup": true }` → `situacao:
     "CONVERTIDO"` e `restantesNoFormatoAntigo: 0`;
   - corpo `{}` de novo → `situacao: "NADA_A_CONVERTER"`.

   Quem tiver a chave localmente pode, em vez disso, rodar o script
   `scripts/converter-dados-pessoais.ts --producao` do commit `8c2e7df`.
3. **Conferência** no SQL Editor — as três contagens têm que dar `0`:
   ```sql
   SELECT COUNT(*) FROM usuarios WHERE emailLogin NOT LIKE '%@%';
   SELECT COUNT(*) FROM participantes WHERE email NOT LIKE '%@%';
   SELECT COUNT(*) FROM logs_auditoria WHERE atorNomeCifrado IS NOT NULL AND atorNome IS NULL;
   ```
4. **Deploy do código novo** (merge da branch `dados-pessoais-sem-duplicacao`
   na `main`; ela já não tem a rota temporária). Espere a Vercel mostrar o
   deploy como Ready.
5. **Logo em seguida, a migration** (entre o passo 4 e este, o cadastro de
   aluno novo falha; login e o resto funcionam). No PowerShell, de dentro de
   `backend/`, com a URL de produção:
   ```powershell
   $env:DATABASE_URL = "mysql://...SGEA?sslaccept=strict"
   npx prisma migrate status    # deve listar só 20261103150000_dados_pessoais_sem_duplicacao como pendente
   npx prisma migrate deploy
   Remove-Item Env:DATABASE_URL
   ```
6. **Teste**: entrar com cada perfil, abrir Participantes, cadastrar um aluno
   de teste. Depois de uma ou duas semanas sem problema, apagar os backups
   (`DROP TABLE ..._bkp_20261103;` e os backups antigos).

## Implantação em produção: confirmação de e-mail no cadastro (migration de 06/11/2026)

A migration `20261106120000_cadastros_pendentes` **só cria a tabela nova**
`cadastros_pendentes`, sem relação com as outras e sem alterar nada que já
existe. Por isso ela pode (e deve) ir para o banco **antes** do código: a
versão que está no ar continua funcionando normalmente com a tabela criada,
e o login não depende dela. Siga a ordem:

0. **Conferir o SendGrid na Vercel** (Settings → Environment Variables do
   projeto): `SENDGRID_API_KEY` e `EMAIL_FROM` precisam estar preenchidas em
   Production. Sem elas, o código do cadastro não sai e o cadastro de aluno
   responde `503` ("Não foi possível enviar o código agora…"); login e o
   resto do sistema continuam funcionando.
1. **Aplicar a migration no banco de produção, ANTES do push.** No
   PowerShell, de dentro de `backend/`, com a URL de produção:
   ```powershell
   $env:DATABASE_URL = "mysql://...SGEA?sslaccept=strict"
   npx prisma migrate status    # deve listar só 20261106120000_cadastros_pendentes como pendente
   npx prisma migrate deploy
   Remove-Item Env:DATABASE_URL
   ```
   Se o `migrate status` listar qualquer outra migration pendente, pare e
   confira antes de aplicar.
2. **Push na `main`** e esperar a Vercel mostrar o deploy como Ready.
3. **Testar em produção:**
   - Cadastrar um aluno de teste com um e-mail `@alunos.umc.br` real:
     conferir se o código chega (e se não cai no spam), digitar o código e
     ver a conta entrar direto em Eventos. Testar também "Reenviar código"
     (libera depois de 60 segundos) e um código errado.
   - Professor: cadastrar um professor de teste com um e-mail `@umc.br` real,
     conferir se o convite chega com o botão "Criar minha senha" e o link
     abre a tela de primeiro acesso no domínio de produção (`APP_URL`).
   - Entrar com cada perfil (administrador, secretaria, professor e aluno).
     Os Termos de Uso e a Política de Privacidade estão na versão 1
     (`VERSAO_TERMOS_ATUAL` = "1", de 09/11/2026): toda conta nova grava a
     versão 1 no aceite. Conta com outra versão recebe
     `precisaAceitarTermos: true` no login, mas **a tela que pede o novo
     aceite ainda não existe**, então o login funciona normalmente.
   - Em Participantes, abrir "Editar" de um aluno: o e-mail aparece só para
     leitura e não pode ser alterado.
   - Clicar em "Sair": deve pedir confirmação ("Sair do sistema?").
   - Opcional: na tela Auditoria, filtrar por "Cadastro concluído (e-mail
     confirmado)".
4. **Se a migration for esquecida:** o login continua funcionando (a
   limpeza dos cadastros vencidos, feita a cada login, falha sem impedir a
   entrada e só registra o erro no log do servidor), mas o **cadastro de
   aluno novo falha** até a migration ser aplicada. Basta rodar o passo 1;
   não precisa de novo deploy.

Para desfazer (só se for preciso voltar a versão anterior do código): a
tabela pode ficar no banco, porque o código antigo não a usa.

## Implantação em produção: salas no padrão da UMC (migration de 11/11/2026)

A migration `20261111120000_salas_padrao_umc` é **só aditiva**: acrescenta a
coluna `salas.tipo` (sala de aula, laboratório ou auditório, com padrão
`SALA_DE_AULA` para as salas que já existem) e um índice único em
`salas.nome`, que passa a guardar o código da sala (ex.: `1T-01`). Nada é
apagado nem renomeado, e o código que está no ar continua funcionando com
ela aplicada. Siga a ordem:

1. **Conferir que não há duas salas com o mesmo nome** (o índice único
   falharia). No SQL Editor do TiDB Cloud, no banco `SGEA`:
   ```sql
   SELECT nome, COUNT(*) FROM salas GROUP BY nome HAVING COUNT(*) > 1;
   ```
   Tem que voltar vazio. Se voltar alguma linha, pare e renomeie antes.
2. **Aplicar a migration no banco de produção, ANTES do push.** No
   PowerShell, de dentro de `backend/`, com a URL de produção:
   ```powershell
   $env:DATABASE_URL = "mysql://...SGEA?sslaccept=strict"
   npx prisma migrate status    # deve listar só 20261111120000_salas_padrao_umc como pendente
   npx prisma migrate deploy
   Remove-Item Env:DATABASE_URL
   ```
   Se o `migrate status` listar qualquer outra migration pendente, pare e
   confira antes de aplicar.
3. **Push na `main`** e esperar a Vercel mostrar o deploy como Ready.
4. **Recarregar a demonstração (opcional, apaga tudo):** as salas antigas
   continuam com o nome de antes e o tipo "Sala de aula" até serem editadas.
   Para ter as 12 salas no padrão da UMC, rode a carga de demonstração
   (seção "Scripts disponíveis"), primeiro só simulando:
   ```powershell
   npx tsx scripts/carga-demonstracao.ts --producao
   npx tsx scripts/carga-demonstracao.ts --producao --aplicar
   ```
5. **Testar em produção:** tela Salas (três seleções, tipo, filtros por
   prédio e tipo, código repetido recusado); tela Equipe (o administrador
   cria uma secretaria e o convite chega; a secretaria não vê a opção
   Secretaria; excluir uma conta com convite pendente); inscrição de um aluno
   em dois eventos no mesmo horário (a segunda é recusada com o nome do
   outro evento).
6. **Se a migration for esquecida:** a listagem e o cadastro de salas, os
   eventos e o check-in falham, porque o código novo lê a coluna `tipo`.
   Basta rodar o passo 2; não precisa de novo deploy.

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor em modo desenvolvimento (recarrega sozinho a cada mudança). |
| `npm run build` | Compila TypeScript pra `dist/`. |
| `npm start` | Roda a versão compilada (`dist/server.js`) — uso em produção. |
| `npm run typecheck` | Só confere tipos, sem gerar arquivo nenhum. |
| `npm run typecheck:scripts` | Confere os tipos dos scripts de `scripts/` e do seed. |
| `npm run db:migrate` | Cria/atualiza as tabelas no banco a partir do `schema.prisma`. |
| `npm run db:seed` | Cria as três contas de demonstração (admin@, secretaria@ e professor@umc.br) que ainda não existirem (idempotente). |
| `npm run db:studio` | Abre o Prisma Studio (interface visual pra ver/editar os dados). |
| `npx tsx scripts/definir-senha.ts email@dominio` | Define uma senha nova para uma conta que já existe (ver abaixo). |
| `npx tsx scripts/resetar-2fa.ts email@dominio` | Zera o 2FA de uma conta (emergência; mesmo esquema de flags). |
| `npx tsx scripts/carga-demonstracao.ts` | **Apaga todos os dados** e carrega a demonstração (ver abaixo). |

### Carga de demonstração

Apaga **todos** os dados do banco (contas, eventos, inscrições, auditoria,
limites de acesso, cadastros pendentes, convites, códigos do 2FA etc.) e
carrega um cenário realista para a apresentação: 12 salas no padrão da UMC
(8 de aula, 2 laboratórios e 2 auditórios), 40 palestrantes (mais 3
aguardando aprovação), 150 professores, 1 secretaria e 1.000 alunos fictícios,
200 eventos (150 encerrados, 25 futuros aprovados e 25 em aprovação: 15
aguardando, 5 recusados e 5 aprovados com proposta de alteração aguardando),
com histórico, inscrições (nenhum aluno em dois eventos no mesmo horário),
check-in, questionário, certificados e avaliações, além das três contas de
demonstração (senhas das `SEED_*_SENHA`; o e-mail do administrador em
`SEED_ADMIN_EMAIL`). As contas fictícias (`usuarios.ficticio`), a secretaria e
o professor de demonstração nunca recebem e-mail. A **auditoria começa vazia**.

No fim, a carga imprime o **roteiro da apresentação**: o evento da
apresentação (13/11 às 21:00, com 12 pedidos de check-in, 2 presentes que
avaliaram sem questionário e 1 com o questionário respondido), os dois eventos
no mesmo horário, o lotado, o de uma vaga, os eventos do professor de
demonstração (aprovado, com proposta recusada e aguardando, aguardando
aprovação e recusado), os palestrantes aguardando, os convites pendentes, os
professores inativos, a secretaria fictícia, os alunos inativados, um aluno
para bloquear ao vivo e um código de certificado para validar.

Rode de dentro de `backend/`:

```powershell
npx tsx scripts/carga-demonstracao.ts                         # simulação no banco do .env
npx tsx scripts/carga-demonstracao.ts --aplicar               # apaga tudo e carrega no banco do .env
npx tsx scripts/carga-demonstracao.ts --producao              # simulação no banco de produção
npx tsx scripts/carga-demonstracao.ts --producao --aplicar    # apaga tudo e carrega em produção
```

- Sem `--aplicar`, só mostra o banco de destino (o nome, nunca a URL), o que
  seria criado e quantos registros seriam apagados.
- `--producao` carrega o `.env.production.local`, onde também precisam estar
  `SEED_ADMIN_SENHA`, `SEED_SECRETARIA_SENHA` e `SEED_PROFESSOR_SENHA`. Se
  faltar alguma, o script para antes de apagar qualquer coisa.
- Com `--aplicar`, **antes de apagar**, salva uma cópia de todas as tabelas
  em `backend/backups/backup-<data-hora>.json` (fora do git). Se a cópia
  falhar, nada é apagado. **A cópia tem dados pessoais: apague o arquivo
  assim que conferir a carga.**
- As datas são calculadas a partir do dia em que o script roda (fuso de São
  Paulo). O evento da apresentação do professor de demonstração fica em
  13/11/2026 às 21:00, com 35 inscritos e 12 pedidos de check-in; troque a
  data com `--evento-apresentacao "2026-11-13T21:00"`.

### Definir a senha de uma conta que já existe

Útil para as contas de equipe criadas pelo seed num banco antigo (o seed não
muda a senha de conta que já existe) ou para uma conta cujo e-mail não
recebe o código do "Esqueci a senha". Rode de dentro de `backend/`, num
terminal interativo:

```powershell
npx tsx scripts/definir-senha.ts admin@umc.br                       # simulação no banco do .env
npx tsx scripts/definir-senha.ts admin@umc.br --aplicar             # pede a senha e grava no banco do .env
npx tsx scripts/definir-senha.ts admin@umc.br --producao            # simulação no banco de produção
npx tsx scripts/definir-senha.ts admin@umc.br --producao --aplicar  # pede a senha e grava em produção
```

- Sem `--aplicar`, só mostra a conta encontrada (id, perfil, 2FA e se o
  login está bloqueado) e não muda nada.
- `--producao` carrega o `.env.production.local`; se o arquivo não
  existir, o script para sem fazer nada.
- Com `--aplicar`, pede a senha nova duas vezes **sem mostrar o que é
  digitado** e confere a regra de senha do sistema.
- Ao gravar:
  - usa o mesmo hash bcrypt do sistema;
  - encerra as sessões abertas da conta;
  - limpa o bloqueio de tentativas de login;
  - registra `SENHA_REDEFINIDA` na auditoria.
- A senha nunca aparece na tela nem no log. O 2FA da conta não muda.

## Estrutura

```
backend/
  prisma/
    schema.prisma       modelo do banco (tabelas, relacionamentos, enums)
    seed.ts              dados de demonstração
  src/
    config/            leitura/validação das variáveis de ambiente
    db/
      prisma.ts          instância única do Prisma Client, usada por todos os services
    errors/            classe AppError — formato de erro padrão da API
    middleware/        autenticação (JWT), autorização por perfil, validação, tratamento de erro
    modules/           um módulo por recurso (auth, eventos, salas, palestrantes,
                       participantes, inscricoes, feedbacks, usuarios, questionario, email),
                       cada um com routes → service → schemas
    types/             tipos das entidades (domain.ts) e extensão do Request do Express
    utils/             JWT, hash de senha, DTOs de resposta, wrapper de rota async
    expressApp.ts       monta o Express (middlewares globais + todas as rotas)
    main.ts             ponto de entrada (sobe o servidor HTTP)
```

Cada módulo segue o mesmo padrão: `*.routes.ts` define os endpoints e quem
pode chamá-los (`autenticar`/`autorizar`), `*.service.ts` tem a lógica de
negócio e conversa com o Prisma, `*.schemas.ts` tem a validação de entrada
com Zod. Isso mantém a regra de autorização visível logo na definição da
rota, em vez de escondida no meio da lógica de negócio.

Como o Prisma devolve datas como objetos `Date` e o resto do app trabalha
com string ISO (pra bater com o formato que o frontend sempre esperou),
cada service que expõe uma entidade tem uma função `paraDominio` logo no
topo do arquivo, convertendo o registro do banco pro formato da API antes
de devolver.

### Integridade referencial

Regras como "não deixar excluir uma sala com evento vinculado" ou "não
deixar dois participantes com o mesmo e-mail" existem em duas camadas: o
próprio schema do MySQL (chave estrangeira com `onDelete: Restrict`,
coluna `@unique`) e uma checagem prévia no `*.service.ts` correspondente,
que existe só pra devolver uma mensagem de erro legível em vez do erro cru
do banco. Exclusão em cascata (ex: apagar um evento junto com suas
inscrições/feedbacks/tentativas de questionário) é feita pelo próprio
MySQL via `onDelete: Cascade`, configurado em `prisma/schema.prisma`.
