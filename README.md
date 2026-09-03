# SGEA — Sistema de Gestão de Eventos Acadêmicos

Projeto de TCC/PFC: um sistema pra gerenciar eventos acadêmicos (palestras,
minicursos, workshops, etc.) — cadastro de eventos, salas e palestrantes,
inscrição e check-in de participantes, emissão de certificado e feedback.

Frontend em React + TypeScript, feito aqui. Backend em Java/Spring Boot,
feito à parte por outra pessoa, em outra IDE — o contrato entre os dois
está em [`docs/api-contract.md`](docs/api-contract.md).

Demo publicada: https://caiquecrepaldi.github.io/SistemaGestaoEventosAcademicos/#/

## Estrutura do repositório

```
frontend/   React + TypeScript + Vite — único que roda hoje
backend/    Java + Spring Boot — em desenvolvimento separado
docs/       contrato de API entre os dois lados
```

## Perfis e permissões

Três perfis de usuário:

- **Administrador** e **Secretaria** — acesso igual, total: CRUD de
  eventos, salas, palestrantes e participantes; gestão de inscrições;
  check-in (confirmar presença/ausência e exportar lista); emissão de
  certificado de qualquer participante; dashboard com estatísticas gerais.
- **Aluno** — perfil com cadastro público (`/cadastro`, sem precisar de
  admin criar a conta). Só lê eventos, agenda e palestrantes (sem ver
  telefone do palestrante); se inscreve sozinho nos eventos que quiser
  (com verificação de vaga e de inscrição duplicada); recebe e-mail de
  confirmação; vê e emite os próprios certificados, liberados só depois
  que a presença é confirmada por um administrador/secretaria no check-in.
  Não acessa telas de gestão, participantes ou check-in.

Cada evento (palestra, minicurso ou workshop) é cadastrado como um item só
— não existe mais um "evento guarda-chuva" com várias sessões dentro,
como em versões anteriores deste projeto. Ao criar um evento, admin/
secretaria também podem cadastrar as perguntas do questionário de feedback
que será associado a ele.

O detalhe completo — endpoint por endpoint, o que cada perfil pode chamar
e quais erros esperar — está em
[`docs/api-contract.md`](docs/api-contract.md). Vale destacar uma coisa de
lá: a maior parte das restrições de perfil não são rotas separadas, são
regras aplicadas em cima do mesmo endpoint REST (esconder campo, filtrar
linha, ignorar valor forjado no corpo) — então testar só pela tela não
basta, a validação de verdade tem que estar no backend.

Contas de demonstração (modo mock, ver abaixo):

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@ifsp.edu.br | admin123 |
| Secretaria | secretaria@ifsp.edu.br | secretaria123 |
| Aluno | aluno@aluno.ifsp.edu.br | aluno123 |

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

Duas variáveis de ambiente controlam isso (copia `frontend/.env.example`
pra `frontend/.env.local`, que não é versionado):

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
`localStorage["sgea:session"]` depois do login). Precisa do Spring Boot
rodando e implementando o contrato descrito em `docs/api-contract.md`.

Pra trocar, edita `frontend/.env.local` e reinicia o `npm run dev` (env
var não recarrega sozinha). Por baixo do capô, os services que fazem
requisição (`crud.ts`, `authService.ts`, `emailService.ts`,
`inscricaoAlunoService.ts`, `certificadoService.ts`) têm dois adapters —
localStorage e HTTP — atrás da mesma interface, escolhidos uma vez no
import a partir de `VITE_USE_MOCK`. Nenhuma página sabe qual modo está
ativo.

Mais detalhe de scripts e deploy em [`frontend/README.md`](frontend/README.md).

## Backend

Ainda em desenvolvimento, feito separadamente (ver
[`backend/README.md`](backend/README.md)). O contrato que ele precisa
implementar pra o frontend funcionar em modo integrado está todo descrito
em [`docs/api-contract.md`](docs/api-contract.md), incluindo o que ainda é
mockado no frontend e as lacunas conhecidas.
