# Frontend — Sistema de Gestão de Eventos Acadêmicos

React 19 + TypeScript + Vite. O backend (Java/Spring Boot) é feito à parte,
o contrato entre os dois tá em [`../docs/api-contract.md`](../docs/api-contract.md).

## Rodando

```bash
npm install
cp .env.example .env.local   # ajusta os valores se precisar
npm run dev
```

## Mock vs. integrado

Duas variáveis controlam isso, em `.env.local` (não versionado, copia do
`.env.example`):

| Variável | mock (padrão) | integrado |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `false` |
| `VITE_API_URL` | ignorado | url da API, tipo `http://localhost:8080/api` |

No modo mock os dados ficam no localStorage do navegador, pré-carregados de
`src/services/seed.ts` — não precisa do backend rodando, é o jeito normal
de mexer na UI no dia a dia. E-mail de confirmação de inscrição só vai pro
console e pra `localStorage["sgea:emails-enviados"]`, já que não tem
servidor de e-mail nenhum aqui.

No modo integrado cada chamada de serviço vira request HTTP de verdade pra
`VITE_API_URL`, com `Authorization: Bearer <token>` (token vem da sessão
salva em `localStorage["sgea:session"]` no login). Precisa do Spring Boot
rodando e seguindo o contrato do `docs/api-contract.md`.

Pra trocar, edita o `.env.local` e reinicia o `npm run dev` (env var não
recarrega sozinha). Sem `.env` nenhum configurado o app cai em mock por
padrão — só `false` explícito liga o modo integrado.

Por baixo do capô: `crud.ts`, `authService.ts` e `emailService.ts` têm cada
um dois adapters (localStorage e HTTP via `api.ts`) atrás da mesma
interface, escolhidos uma vez no import pelo `VITE_USE_MOCK`. Página nenhuma
sabe qual modo tá ativo.

## Scripts

```bash
npm run dev       # dev server
npm run build     # type-check + build em dist/
npm run preview   # serve o build localmente
npm run deploy    # build + publica em gh-pages
```

## Deploy

Manual, `npm run deploy` (pacote `gh-pages`) publica `dist/` na branch
`gh-pages`. O `base` do Vite e o `HashRouter` no `App.tsx` são por causa do
GitHub Pages não suportar client-side routing de fábrica.
