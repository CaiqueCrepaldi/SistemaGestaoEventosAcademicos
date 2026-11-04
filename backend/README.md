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

Crie um arquivo `backend/.env` (não é versionado, ver `.gitignore`) com:

```
PORT=8080
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
DATABASE_URL="mysql://usuario:senha@host.tidbcloud.com:4000/sgea?sslaccept=strict"
JWT_SECRET=troque-este-valor-por-um-segredo-longo-e-aleatorio
JWT_EXPIRES_IN=8h
ENCRYPTION_KEY=
SENDGRID_API_KEY=
EMAIL_FROM=
```

`DATABASE_URL`, `JWT_SECRET` e `ENCRYPTION_KEY` são obrigatórios pra o
servidor subir (troque o `JWT_SECRET` por um valor aleatório e longo em
qualquer ambiente real — quem souber esse segredo consegue forjar token de
admin). Deixe `SENDGRID_API_KEY`/`EMAIL_FROM` em branco em dev: sem eles, o
backend só imprime o e-mail no console em vez de enviar de verdade.

`ENCRYPTION_KEY` cifra o segredo do 2FA (AES-256-GCM, ver
`src/utils/criptografia.ts`) e assina o HMAC dos códigos de recuperação do
2FA e das chaves do limite de tentativas. Nome, e-mail e RGM ficam em texto
puro. Precisa ser uma chave de 32 bytes em base64:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Trocar essa chave torna ilegível todo dado já cifrado com a antiga (o 2FA
de todo mundo para de funcionar) — guarde-a com o mesmo cuidado que o
`JWT_SECRET`, nunca a perca.**

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
npm run db:seed      # popula com os dados de demonstração
npm run dev
```

API disponível em `http://localhost:8080/api` (porta configurável via
`PORT` no `.env`). `GET /health` (fora do prefixo `/api`) serve só pra
conferir que o processo subiu.

### Apontar o frontend pra essa API

No `frontend/.env` (crie se não existir):

```
VITE_API_URL=http://localhost:8080/api
```

As contas de demonstração são as mesmas dos dois lados (só no banco de
desenvolvimento, criadas pelo seed — em produção use outras senhas):

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@umc.br | admin123 |
| Secretaria | secretaria@umc.br | secretaria123 |
| Aluno | aluno@alunos.umc.br | aluno123 |

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

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor em modo desenvolvimento (recarrega sozinho a cada mudança). |
| `npm run build` | Compila TypeScript pra `dist/`. |
| `npm start` | Roda a versão compilada (`dist/server.js`) — uso em produção. |
| `npm run typecheck` | Só confere tipos, sem gerar arquivo nenhum. |
| `npm run typecheck:scripts` | Confere os tipos dos scripts de `scripts/` e do seed. |
| `npm run db:migrate` | Cria/atualiza as tabelas no banco a partir do `schema.prisma`. |
| `npm run db:seed` | Popula o banco com os dados de demonstração (idempotente, pode rodar de novo). |
| `npm run db:studio` | Abre o Prisma Studio (interface visual pra ver/editar os dados). |

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
