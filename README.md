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

- **Administrador** e **Secretaria** — acesso igual, total: CRUD de
  eventos, salas e palestrantes; leitura (com busca) da lista de
  participantes; gestão de inscrições; check-in (confirmar
  presença/ausência); consulta da nota de todos os alunos no questionário de
  cada evento; emissão de certificado de qualquer participante; dashboard
  com estatísticas gerais.
- **Aluno** — perfil com cadastro público (`/cadastro`, sem precisar de
  admin criar a conta, e-mail institucional obrigatório terminando em
  `@alunos.umc.br`). Só lê eventos, agenda, salas e palestrantes (sem ver
  telefone do palestrante); se inscreve sozinho nos eventos que quiser (com
  verificação de vaga e de inscrição duplicada); recebe e-mail de
  confirmação; responde ao questionário do evento depois que a presença é
  confirmada no check-in; só emite o próprio certificado se atingir 60% de
  acertos. Não acessa telas de gestão, participantes ou check-in.

As telas de **Salas** (`/salas`) e **Palestrantes** (`/palestrantes`) têm
cadastro completo (criar, editar, excluir) restrito a administrador/
secretaria — sala com nome e capacidade, palestrante com nome, e-mail e
telefone (com máscara automática). Aluno só enxerga as duas listas em modo
leitura. Cada evento referencia uma sala e um palestrante já existentes,
além de um questionário obrigatório
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

Todo formulário de cadastro (evento, conta de aluno) valida nome (só
letras), e-mail e RGM (11 caracteres, normalizado em maiúsculo) e avisa
qualquer erro por notificação na tela — nunca por `alert()` ou só no
console — com a mesma regra espelhada no backend via Zod. Editar ou excluir
qualquer cadastro pede confirmação antes de gravar. Participantes não têm
mais cadastro manual pela interface — a tabela é gerida direto no banco, e
todo Participante hoje nasce automaticamente do cadastro de conta de aluno.

Contas de demonstração:

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@umc.br | admin123 |
| Secretaria | secretaria@umc.br | secretaria123 |
| Aluno | aluno@alunos.umc.br | aluno123 |

O aluno de demonstração já está inscrito e com presença confirmada num
evento, pronto pra testar o questionário e a emissão do certificado sem
precisar repetir os passos de inscrição e check-in.

## Rodando o frontend

```bash
cd frontend
npm install
npm run dev
```

Abre em `http://localhost:5173` (ou a próxima porta livre). Precisa do
backend (`backend/`) rodando — ver [`backend/README.md`](backend/README.md)
pra como subir ele — porque toda a aplicação fala direto com a API/banco
real, não existe mais um modo "mock" com dado fake no navegador.

Cria `frontend/.env.local` (não é versionado) com a variável abaixo
apontando pro backend:

```
VITE_API_URL=http://localhost:8080/api
```

Cada chamada de serviço vira request HTTP de verdade pra `VITE_API_URL`,
com `Authorization: Bearer <token>` (token salvo em
`localStorage["sgea:session"]` depois do login — a única coisa que o
frontend guarda no navegador é a sessão, não dado de negócio). Certificado
continua sendo gerado em PDF direto no navegador com `jsPDF`, seguindo o
modelo oficial de certificado da UMC (moldura, logo, assinatura e selo).

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
