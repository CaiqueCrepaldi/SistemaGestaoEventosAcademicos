import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UsuarioAutenticado } from "../types/express";

// converte "8h"/"1d"/"30m" pro numero de segundos, pra devolver no expiresIn do login
export function duracaoEmSegundos(duracao: string): number {
  const match = /^(\d+)([smhd])$/.exec(duracao);
  if (!match) return 8 * 60 * 60; // fallback 8h
  const valor = Number(match[1]);
  const unidade = match[2];
  const multiplicadores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return valor * multiplicadores[unidade];
}

export function assinarToken(payload: UsuarioAutenticado): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: duracaoEmSegundos(env.jwtExpiresIn) });
}

export function verificarToken(token: string): UsuarioAutenticado {
  return jwt.verify(token, env.jwtSecret) as UsuarioAutenticado;
}
