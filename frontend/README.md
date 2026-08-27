# Frontend — Sistema de Gestão de Eventos Acadêmicos

React 19 + TypeScript + Vite. O backend (Java/Spring Boot) é desenvolvido à
parte — o contrato entre os dois está em [`../docs/api-contract.md`](../docs/api-contract.md).

## Rodando o projeto

```bash
npm install
cp .env.example .env.local   # ajuste os valores se precisar
npm run dev
```

## Modo mock vs. modo integrado

O app roda dos dois jeitos, controlado por duas variáveis de ambiente
(`.env.local`, não versionado — copie de `.env.example`):

| Variável | Modo mock (padrão) | Modo integrado |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `false` |
| `VITE_API_URL` | ignorado | URL da API Spring Boot (ex: `http://localhost:8080/api`) |

- **Modo mock** (`VITE_USE_MOCK=true`): todos os dados vivem no
  `localStorage` do navegador, pré-carregados a partir de `src/services/seed.ts`.
  Não precisa do backend rodando — é o modo padrão pra desenvolver a UI.
  E-mails de confirmação de inscrição são só logados no console
  (`src/services/emailService.ts`) e registrados em
  `localStorage["sgea:emails-enviados"]`, pra dar pra inspecionar sem um
  servidor de e-mail de verdade.

- **Modo integrado** (`VITE_USE_MOCK=false`): toda chamada de serviço vira
  uma requisição HTTP de verdade para `VITE_API_URL`, incluindo o header
  `Authorization: Bearer <token>` (token guardado na sessão salva em
  `localStorage["sgea:session"]` no login). Precisa do backend Spring Boot
  rodando e seguindo exatamente o contrato em `docs/api-contract.md`.

Pra alternar, edite `.env.local` e reinicie `npm run dev` (o Vite não
recarrega variáveis de ambiente em hot-reload). Sem nenhum `.env` configurado
(clone novo, ainda não copiou o `.env.example`), o app cai em modo mock por
padrão — só o `false` explícito ativa o modo integrado.

### Como a troca funciona por baixo dos panos

`src/services/crud.ts`, `src/services/authService.ts` e
`src/services/emailService.ts` implementam cada um dois adapters (local via
`localStorage` / HTTP via `src/services/api.ts`) atrás da **mesma
interface**. A escolha entre eles é feita uma vez, no import, lendo
`import.meta.env.VITE_USE_MOCK`. Nenhuma página ou componente sabe qual dos
dois modos está ativo — todo o resto do app consome sempre a mesma
interface (`CrudService<T>`, `authService.login`, etc).

## Scripts

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # type-check + build de produção em dist/
npm run preview   # serve o build de produção localmente
npm run deploy    # build + publica dist/ na branch gh-pages
```

## Deploy

O deploy pro GitHub Pages é manual, via `npm run deploy` (pacote
`gh-pages`), publicando `dist/` na branch `gh-pages`. Veja `vite.config.ts`
para o `base` configurado e `src/App.tsx` para o `HashRouter` (necessário
porque GitHub Pages não suporta client-side routing sem configuração
extra).
