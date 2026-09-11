# SGEA — Sistema de Gestão de Eventos Acadêmicos

Projeto de TCC/PFC: um sistema pra gerenciar eventos acadêmicos (palestras,
minicursos, workshops, etc.) — inscrição e check-in de participantes,
questionário obrigatório com liberação condicionada de certificado, feedback
e consulta de salas/palestrantes.

Frontend em React + TypeScript. Backend em Node.js + TypeScript + Express,
com **MySQL (TiDB Cloud)** via Prisma como banco de dados e **SendGrid**
para envio de e-mail (confirmação de inscrição e recuperação de senha) — o
contrato entre os dois lados está em
[`docs/api-contract.md`](docs/api-contract.md), e o detalhe de como cada
funcionalidade central foi implementada e testada está em
[`docs/funcionalidades-principais.md`](docs/funcionalidades-principais.md).
Passo a passo completo pra rodar o backend (incluindo o banco e o e-mail) em
[`backend/README.md`](backend/README.md).

Demo publicada: https://sistema-gestao-eventos-academicos.vercel.app/#/login

## Estrutura do repositório

```
frontend/   React + TypeScript + Vite
backend/    Node.js + TypeScript + Express + MySQL/TiDB (Prisma) + SendGrid
docs/       contrato de API e detalhamento das funcionalidades principais
```

## Perfis e permissões

Três perfis de usuário:

- **Administrador** e **Secretaria** — acesso igual, total: CRUD de eventos
  e participantes; gestão de inscrições; check-in (confirmar
  presença/ausência e exportar lista); consulta da nota de todos os alunos
  no questionário de cada evento; emissão de certificado de qualquer
  participante; dashboard com estatísticas gerais.
- **Aluno** — perfil com cadastro público (`/cadastro`, sem precisar de
  admin criar a conta, e-mail institucional obrigatório terminando em
  `@aluno.umc.br`). Só lê eventos, agenda, salas e palestrantes (sem ver
  telefone do palestrante); se inscreve sozinho nos eventos que quiser (com
  verificação de vaga e de inscrição duplicada); recebe e-mail de
  confirmação; responde ao questionário do evento depois que a presença é
  confirmada no check-in; só emite o próprio certificado se atingir 60% de
  acertos. Não acessa telas de gestão, participantes ou check-in.

As telas de **Salas** (`/salas`) e **Palestrantes** (`/palestrantes`)
continuam visíveis pra todos os perfis, mas só como listagem de leitura — o
cadastro (criar/editar/excluir) dessas duas tabelas foi removido da
interface e agora é feito direto no banco de dados. Cada evento referencia
uma sala e um palestrante já existentes, além de um questionário obrigatório
de 10 perguntas (4 alternativas, 1 correta cada) definido por
administrador/secretaria no momento da criação — é esse questionário que o
aluno precisa responder, acertando pelo menos 6 de 10, para liberar a
emissão do certificado. Detalhe completo em
[`docs/funcionalidades-principais.md`](docs/funcionalidades-principais.md).

O detalhe completo — endpoint por endpoint, o que cada perfil pode chamar e
quais erros esperar — está em
[`docs/api-contract.md`](docs/api-contract.md). Vale destacar uma coisa de
lá: a maior parte das restrições de perfil não são rotas separadas, são
regras aplicadas em cima do mesmo endpoint REST (esconder campo, filtrar
linha, ignorar valor forjado no corpo, esconder o gabarito do questionário
antes da resposta) — então testar só pela tela não basta, a validação de
verdade tem que estar no backend.

Todo formulário de cadastro (participante, evento, conta de aluno) valida
nome (só letras), e-mail e RGM (11 caracteres, normalizado em maiúsculo) e
avisa qualquer erro por notificação na tela — nunca por `alert()` ou só no
console — com a mesma regra espelhada no backend via Zod. Editar ou excluir
qualquer cadastro pede confirmação antes de gravar.

Contas de demonstração:

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@umc.br | admin123 |
| Secretaria | secretaria@umc.br | secretaria123 |
| Aluno | aluno@aluno.umc.br | aluno123 |

O aluno de demonstração já está inscrito e com presença confirmada num
evento, pronto pra testar o questionário e a emissão do certificado sem
precisar repetir os passos de inscrição e check-in.

## Rodando o frontend

```bash
cd frontend
npm install
npm run dev
```

Abre em `http://localhost:5173` (ou a próxima porta livre). Por padrão,
sem nenhum `.env` configurado, ele já sobe em **modo mock** — dá pra usar
o sistema inteiro sem o backend rodando.

### Modo mock vs. modo integrado

Duas variáveis de ambiente controlam isso (cria `frontend/.env.local`, que
não é versionado, com as duas variáveis abaixo):

| Variável | mock (padrão) | integrado |
|---|---|---|
| `VITE_USE_MOCK` | `true` (ou nem existir) | `false` |
| `VITE_API_URL` | ignorado | ex: `http://localhost:8080/api` |

**Mock**: os dados vivem no `localStorage` do navegador, pré-carregados de
`frontend/src/services/seed.ts`. Não precisa do backend rodando — é o
jeito normal de trabalhar na UI no dia a dia. E-mail de confirmação de
inscrição só vai pro console e some numa mensagem na tela, já que não tem
servidor de e-mail nenhum nesse modo. Certificado é gerado em PDF direto
no navegador com `jsPDF`, também sem precisar do backend.

**Integrado**: cada chamada de serviço vira request HTTP de verdade pra
`VITE_API_URL`, com `Authorization: Bearer <token>` (token salvo em
`localStorage["sgea:session"]` depois do login). Precisa do backend
(`backend/`) rodando — ver [`backend/README.md`](backend/README.md) pra
como subir ele.

Pra trocar, edita `frontend/.env.local` e reinicia o `npm run dev` (env
var não recarrega sozinha). Por baixo do capô, os services que fazem
requisição (`crud.ts`, `authService.ts`, `emailService.ts`,
`inscricaoAlunoService.ts`, `certificadoService.ts`, `questionarioService.ts`)
têm dois adapters — localStorage e HTTP — atrás da mesma interface,
escolhidos uma vez no import a partir de `VITE_USE_MOCK`. Nenhuma página
sabe qual modo está ativo.

Mais detalhe de scripts e deploy em [`frontend/README.md`](frontend/README.md).

## Backend

Node.js + TypeScript + Express, implementando exatamente o contrato de
[`docs/api-contract.md`](docs/api-contract.md) (rotas, formatos,
autorização por perfil). Os dados ficam num cluster **TiDB Cloud**
(compatível com o protocolo MySQL), acessado via Prisma
(`backend/prisma/schema.prisma`), com as mesmas contas de demonstração da
tabela acima. E-mail de confirmação de inscrição e de recuperação de senha
é enviado via **SendGrid** (sem API key configurada, cai no modo de só
logar no console — não precisa de conta nenhuma pra testar em dev). Passo a
passo completo pra rodar localmente (banco, e-mail e migrações) em
[`backend/README.md`](backend/README.md).

## Deploy

Frontend e backend sobem juntos na Vercel como dois "services" do mesmo
projeto (`vercel.json` na raiz): `/api/*` é roteado pro backend (Express
empacotado com esbuild) e o resto pro build estático do frontend (Vite).
Deploy de produção acontece a partir de pushes na branch `main`.
