# Frontend — Sistema de Gestão de Eventos Acadêmicos

React 19 + TypeScript + Vite. O backend (Node.js + Express) é feito à parte,
o contrato entre os dois tá em [`../docs/api-contract.md`](../docs/api-contract.md).

## Rodando

```bash
npm install
npm run dev
```

Precisa do backend (`../backend`) rodando — não existe modo "mock" com
dado fake no navegador, toda a aplicação fala direto com a API/banco real.
Crie `frontend/.env.local` (não é versionado) com:

```
VITE_API_URL=http://localhost:8080/api
```

Cada chamada de serviço (`crud.ts`, `authService.ts`, `emailService.ts`
etc., todos por cima de `api.ts`) vira request HTTP de verdade pra
`VITE_API_URL`, com `Authorization: Bearer <token>` (token vem da sessão
salva em `localStorage["sgea:session"]` no login — a única coisa que o
frontend guarda no navegador é a sessão, não dado de negócio).

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
