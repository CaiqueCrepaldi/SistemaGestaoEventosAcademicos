// empacota o backend inteiro num arquivo so (dist/main.js), pra vercel nao
// precisar rastrear cada pacote em node_modules na hora de montar a funcao
// serverless (foi isso que dava "cannot find module 'cors'" em producao
// mesmo com tudo instalado certo — o rastreamento remoto da vercel nao
// encontrava os pacotes puros js, so empacotar tudo junto resolveu de vez)
import { build } from "esbuild";
import { cpSync, mkdirSync } from "fs";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  // prisma nao pode ser empacotado: ele resolve a engine nativa (.so/.dll) por
  // caminho relativo ao proprio pacote em node_modules, empacotar quebra isso
  external: ["@prisma/client", ".prisma/client"],
});

// o rastreamento automatico de dependencias externas da vercel nao estava
// incluindo o @prisma/client no deploy remoto (mesmo funcionando local) —
// copia na mao pra dentro de dist/node_modules, do lado do main.js, pra
// virar so mais um arquivo do build e nao depender desse rastreamento
mkdirSync("dist/node_modules", { recursive: true });
cpSync("node_modules/@prisma/client", "dist/node_modules/@prisma/client", { recursive: true });
cpSync("node_modules/.prisma", "dist/node_modules/.prisma", { recursive: true });

console.log("[bundle-vercel] dist/main.js gerado (com @prisma/client copiado manualmente)");
