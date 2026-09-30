import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { TipoTokenEtapa, UsuarioAutenticado } from "../types/express";

// converte "8h"/"1d"/"30m" pro numero de segundos, pra devolver no expiresIn do login
export function duracaoEmSegundos(duracao: string): number {
  const match = /^(\d+)([smhd])$/.exec(duracao);
  if (!match) return 8 * 60 * 60; // fallback 8h
  const valor = Number(match[1]);
  const unidade = match[2];
  const multiplicadores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return valor * multiplicadores[unidade];
}

// payload de qualquer token assinado por nos: sessao normal (sem "tipo") ou etapa do 2FA (com "tipo")
export type PayloadToken = UsuarioAutenticado & { tipo?: TipoTokenEtapa };

// assina um jwt novo pro usuario, expira conforme env.jwtExpiresIn
export function assinarToken(payload: UsuarioAutenticado): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: duracaoEmSegundos(env.jwtExpiresIn) });
}

// token curto da etapa do 2FA (senha certa, falta o codigo). O "tipo" faz o middleware
// autenticar recusar esse token em qualquer rota que nao seja a da propria etapa
export function assinarTokenEtapa(
  usuario: { id: string; perfil: UsuarioAutenticado["perfil"]; participanteId: string | null; versaoToken: number },
  tipo: TipoTokenEtapa,
  expiraEmSegundos: number,
): string {
  const payload: PayloadToken = {
    sub: usuario.id,
    perfil: usuario.perfil,
    participanteId: usuario.participanteId,
    versaoToken: usuario.versaoToken,
    tipo,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: expiraEmSegundos });
}

// valida assinatura/expiracao e devolve o payload decodificado
export function verificarToken(token: string): PayloadToken {
  return jwt.verify(token, env.jwtSecret) as PayloadToken;
}
