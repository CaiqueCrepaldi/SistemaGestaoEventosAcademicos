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
SENDGRID_API_KEY=
EMAIL_FROM=
```

`DATABASE_URL` e `JWT_SECRET` são obrigatórios pra o servidor subir (troque
o `JWT_SECRET` por um valor aleatório e longo em qualquer ambiente real —
quem souber esse segredo consegue forjar token de admin). Deixe
`SENDGRID_API_KEY`/`EMAIL_FROM` em branco em dev: sem eles, o backend só
imprime o e-mail no console em vez de enviar de verdade.

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
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:8080/api
```

Com isso o frontend para de usar o mock em localStorage e passa a bater
direto nesta API. As contas de demonstração são as mesmas dos dois lados:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@umc.br | admin123 |
| Secretaria | secretaria@umc.br | secretaria123 |
| Aluno | aluno@aluno.umc.br | aluno123 |

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor em modo desenvolvimento (recarrega sozinho a cada mudança). |
| `npm run build` | Compila TypeScript pra `dist/`. |
| `npm start` | Roda a versão compilada (`dist/server.js`) — uso em produção. |
| `npm run typecheck` | Só confere tipos, sem gerar arquivo nenhum. |
| `npm run db:migrate` | Cria/atualiza as tabelas no banco a partir do `schema.prisma`. |
| `npm run db:push` | Alternativa ao migrate pra ambientes sem banco de sombra (sem gerar arquivo de migration). |
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
