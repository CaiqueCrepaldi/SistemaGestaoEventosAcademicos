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
  eventos, salas e palestrantes; lista de participantes com busca,
  correção de dados, inativação/reativação de aluno (com motivo) e a
  situação da conta de cada aluno (2FA ativado e acesso liberado/bloqueado);
  tela Eventos em calendário do mês (com busca e filtro de situação em lista);
  gestão de inscrições; exclusão de feedback (com motivo); check-in (aprovar ou
  recusar o pedido de check-in feito pelo aluno — o professor faz o mesmo nos
  eventos dele); consulta da nota de todos os alunos no questionário de
  cada evento; emissão de certificado de qualquer participante; **Dashboard**
  (indicadores de eventos, inscrições, presença, certificados e feedback,
  vagas preenchidas dos próximos eventos, ocupação real das salas — presentes
  ÷ capacidade nos eventos encerrados, também por sala na tela Salas — e
  gráficos de presença e de aprendizagem por evento). A única
  diferença: só o **Administrador** reseta o 2FA e remove o bloqueio por
  tentativas de um aluno (botões na tela Participantes).
- **Aluno** — perfil com cadastro público (`/cadastro`, sem precisar de
  admin criar a conta, e-mail institucional obrigatório terminando em
  `@alunos.umc.br`). Só lê eventos, agenda, salas e palestrantes; se
  inscreve sozinho nos eventos que quiser (com
  verificação de vaga e de inscrição duplicada); recebe e-mail de
  confirmação; pede o próprio check-in na tela Eventos (de 1 hora antes do
  início até 24 horas depois do fim do evento) e responde ao questionário
  depois que o professor do evento ou a equipe aprova o pedido; só emite o
  próprio certificado se atingir 60% de acertos. Não acessa telas de gestão,
  participantes nem a tela Check-in da equipe.

As telas de **Salas** (`/salas`) e **Palestrantes** (`/palestrantes`) têm
cadastro completo (criar, editar, excluir) restrito a administrador/
secretaria — sala com nome e capacidade, palestrante com nome e e-mail.
Aluno só enxerga as duas listas em modo leitura. Cada evento referencia uma sala e um palestrante já existentes,
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

Todo formulário marca os campos obrigatórios com `*` e, ao salvar com
algum campo vazio ou inválido, mostra o erro embaixo do próprio campo (borda
vermelha, foco no primeiro campo com problema) — nunca por `alert()` ou só
no console — com a mesma regra espelhada no backend via Zod (os erros do
backend também aparecem no campo certo). Editar ou excluir qualquer
cadastro pede confirmação antes de gravar. Participantes não têm cadastro
manual — todo Participante nasce do cadastro de conta de aluno; a equipe
corrige os dados e inativa/reativa o aluno pela tela Participantes.

Senhas ficam só como hash bcrypt (custo 12, salt aleatório por senha). A
autenticação em dois fatores é opcional para todos os perfis; o 2FA de conta
de administrador/secretaria, que não aparece na tela Participantes, é
resetado pelo script `backend/scripts/resetar-2fa.ts`. Nome, e-mail
e RGM ficam sem criptografia, protegidos por controle de acesso por perfil,
HTTPS, banco com acesso restrito e auditoria (ver
[`docs/lgpd/07-medidas-tecnicas-de-seguranca.md`](docs/lgpd/07-medidas-tecnicas-de-seguranca.md)).

Contas de demonstração (criadas pelo seed, só no banco de desenvolvimento;
o ideal é ativar o 2FA nas contas da equipe):

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@umc.br | a de `SEED_ADMIN_SENHA` no seu `backend/.env` |
| Secretaria | secretaria@umc.br | a de `SEED_SECRETARIA_SENHA` |
| Professor | professor@umc.br | a de `SEED_PROFESSOR_SENHA` |

Nenhuma senha fica no código nem na documentação: cada um define as suas no
`backend/.env`. As variáveis, quais são obrigatórias e como gerar os
segredos estão em
[`backend/README.md` → Variáveis de ambiente](backend/README.md#variáveis-de-ambiente).

Para ter o sistema cheio, como na apresentação (salas, palestrantes, 150
professores e 1.000 alunos fictícios, 200 eventos com inscrições, check-in,
notas, certificados e avaliações), rode a carga de demonstração
(`backend/scripts/carga-demonstracao.ts`, ver `backend/README.md`). Ela apaga
todos os dados antes de carregar. As contas fictícias nunca recebem e-mail.

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

Para apontar para outro backend, copie o `frontend/.env.example` para
`frontend/.env` (não é versionado) e ajuste a variável abaixo. Sem ela, o
frontend usa `http://localhost:8080/api`; em produção, o valor fica nas
variáveis da Vercel:

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
