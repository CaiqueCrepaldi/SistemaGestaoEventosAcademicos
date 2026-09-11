import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // gh-pages precisa do path do repo no base, ja a vercel serve na raiz do dominio
  // (a propria vercel injeta a env "VERCEL" durante o build, entao usamos ela pra distinguir)
  base: command === "build" && !process.env.VERCEL ? "/SistemaGestaoEventosAcademicos/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
