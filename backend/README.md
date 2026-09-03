# Backend — Sistema de Gestão de Eventos Acadêmicos

API REST em **Node.js + TypeScript + Express**. Implementa exatamente o
contrato documentado em [`../docs/api-contract.md`](../docs/api-contract.md)
— é a referência oficial de rotas, formatos de request/response e regras
de autorização por perfil; este README é só sobre como rodar o projeto
localmente.

## Sobre o banco de dados

**Este projeto não gerencia banco de dados nenhum.** O PostgreSQL de
verdade é administrado à parte, em outra ferramenta/projeto. Enquanto essa
integração não é ligada, a API guarda os dados **em memória** (dentro do
próprio processo Node) — o suficiente pra rodar e testar todas as rotas,
mas **os dados somem a cada reinício do servidor** (`npm run dev`/`npm start`
sempre volta com as contas de demonstração do zero).

Toda a lógica que hoje mexe nos dados fica isolada em `src/db/` (ver
"Estrutura" abaixo). Ligar num Postgres de verdade depois é trocar o que
tem lá dentro — nenhuma rota, controller ou regra de negócio dos módulos
(`src/modules/`) precisa mudar pra isso.

## Stack

- **Express** — servidor HTTP e roteamento.
- **Zod** — validação de corpo de requisição.
- **jsonwebtoken** + **bcryptjs** — autenticação (JWT) e hash de senha.
- **nodemailer** — envio de e-mail (confirmação de inscrição, código de
  recuperação de senha). Sem SMTP configurado, só imprime no console — não
  precisa de servidor de e-mail de verdade pra testar em dev.
- **tsx** — roda TypeScript direto em dev, sem passo de build manual.

## Passo a passo pra rodar localmente

Crie um arquivo `backend/.env` (não é versionado, ver `.gitignore`) com:

```
PORT=8080
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=troque-este-valor-por-um-segredo-longo-e-aleatorio
JWT_EXPIRES_IN=8h
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Gestão de Eventos Acadêmicos <no-reply@sgea.local>
```

Só `JWT_SECRET` é obrigatório pra o servidor subir (troque por um valor
aleatório e longo em qualquer ambiente real — quem souber esse segredo
consegue forjar token de admin). Deixe as variáveis de `SMTP_*` em branco
em dev: sem SMTP configurado, o backend só imprime o e-mail no console em
vez de enviar de verdade.

```bash
cd backend
npm install
npm run dev
```

API disponível em `http://localhost:8080/api` (porta configurável via
`PORT` no `.env`). `GET /health` (fora do prefixo `/api`) serve só pra
conferir que o processo subiu. Não tem passo de banco de dados nenhum —
os dados de demonstração já carregam sozinhos quando o servidor sobe (ver
`src/db/seedData.ts`).

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
| Administrador | admin@ifsp.edu.br | admin123 |
| Secretaria | secretaria@ifsp.edu.br | secretaria123 |
| Aluno | aluno@aluno.ifsp.edu.br | aluno123 |

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor em modo desenvolvimento (recarrega sozinho a cada mudança). |
| `npm run build` | Compila TypeScript pra `dist/`. |
| `npm start` | Roda a versão compilada (`dist/server.js`) — uso em produção. |
| `npm run typecheck` | Só confere tipos, sem gerar arquivo nenhum. |

## Estrutura

```
backend/
  src/
    config/            leitura/validação das variáveis de ambiente
    db/
      repositorio.ts    repositório genérico em memória (listar/buscar/criar/atualizar/remover)
      store.ts          um repositório por entidade — é o que os services usam
      seedData.ts        dados de demonstração carregados quando o servidor sobe
    errors/            classe AppError — formato de erro padrão da API
    middleware/        autenticação (JWT), autorização por perfil, validação, tratamento de erro
    modules/           um módulo por recurso (auth, eventos, salas, palestrantes,
                       participantes, inscricoes, feedbacks, usuarios, email),
                       cada um com routes → service → schemas
    types/             tipos das entidades (domain.ts) e extensão do Request do Express
    utils/             JWT, hash de senha, DTOs de resposta, wrapper de rota async
    app.ts             monta o Express (middlewares globais + todas as rotas)
    server.ts          ponto de entrada (sobe o servidor HTTP)
```

Cada módulo segue o mesmo padrão: `*.routes.ts` define os endpoints e quem
pode chamá-los (`autenticar`/`autorizar`), `*.service.ts` tem a lógica de
negócio e conversa com `src/db/store.ts`, `*.schemas.ts` tem a validação de
entrada com Zod. Isso mantém a regra de autorização visível logo na
definição da rota, em vez de escondida no meio da lógica de negócio.

### Sobre integridade referencial sem banco de dados

Sem um banco de verdade garantindo unicidade e chave estrangeira, algumas
regras que normalmente o Postgres cuidaria sozinho (não deixar excluir uma
sala com evento vinculado, não deixar dois participantes com o mesmo
e-mail etc.) são checadas manualmente dentro de cada `*.service.ts`, antes
de mexer no repositório. Isso está comentado no código exatamente onde
acontece — procure por comentários citando "ON DELETE" ou "foreign key"
pra achar esses pontos quando for integrar um banco de verdade.
