import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UsuarioAutenticado } from "../types/express";

// Converte "8h" (ou "1d", "30m" etc.) no número de segundos equivalente,
// pra devolver no campo `expiresIn` da resposta de login (documentado como
// número de segundos, ex.: 28800). Só entende horas/minutos/segundos/dias,
// que é o suficiente pro que esse projeto usa.
export function duracaoEmSegundos(duracao: string): number {
  const match = /^(\d+)([smhd])$/.exec(duracao);
  if (!match) return 8 * 60 * 60; // fallback: 8 horas
  const valor = Number(match[1]);
  const unidade = match[2];
  const multiplicadores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return valor * multiplicadores[unidade];
}

// Assina um token novo pra esse usuário — o payload leva só o essencial
// pra autorização (id, perfil, participanteId), nunca nome/e-mail/senha.
export function assinarToken(payload: UsuarioAutenticado): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: duracaoEmSegundos(env.jwtExpiresIn) });
}

// Verifica a assinatura e validade (expiração) do token. Lança o próprio
// erro do jsonwebtoken se for inválido — quem chama (middleware de auth)
// decide como transformar isso num AppError.
export function verificarToken(token: string): UsuarioAutenticado {
  return jwt.verify(token, env.jwtSecret) as UsuarioAutenticado;
}
