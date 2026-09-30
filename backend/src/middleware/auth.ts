import type { NextFunction, Request, Response } from "express";
import type { Perfil } from "../types/domain";
import type { TipoTokenEtapa } from "../types/express";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { verificarToken, type PayloadToken } from "../utils/jwt";
import { prisma } from "../db/prisma";

// le o header Authorization e confere assinatura/prazo do token
function lerToken(req: Request): PayloadToken {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw AppError.naoAutenticado("Token ausente. Envie o header Authorization: Bearer <token>.");
  }
  try {
    return verificarToken(header.slice("Bearer ".length));
  } catch {
    throw AppError.naoAutenticado();
  }
}

// confere se o token nao foi invalidado depois de emitido (troca de senha, inativacao, reset do
// 2FA — ver Usuario.versaoToken). Por isso consulta o banco a cada requisicao
async function conferirVersao(payload: PayloadToken) {
  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub }, select: { versaoToken: true } });
  // token sem "versaoToken" foi emitido antes desse controle existir — vale como versao 1
  // (o default de toda conta), entao ninguem e deslogado so por causa do deploy dessa feature
  if (!usuario || (payload.versaoToken ?? 1) !== usuario.versaoToken) {
    throw AppError.naoAutenticado("Sessão inválida. Faça login novamente.");
  }
}

// exige Authorization: Bearer <token de sessao>, anexa os dados em req.usuario. O token
// temporario da etapa do 2FA nao serve aqui: so vale na rota de verificar o codigo
export const autenticar = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const payload = lerToken(req);
  if (payload.tipo) throw AppError.naoAutenticado("Token inválido para esta rota.");
  await conferirVersao(payload);
  req.usuario = payload;
  next();
});

// rota de uma etapa do login em duas etapas: SO aceita o token temporario daquele tipo
export function autenticarEtapaMfa(tipo: TipoTokenEtapa) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const payload = lerToken(req);
    if (payload.tipo !== tipo) throw AppError.naoAutenticado("Token inválido para esta etapa.");
    await conferirVersao(payload);
    req.etapaMfa = { usuarioId: payload.sub, tipo };
    next();
  });
}

// restringe a rota a um ou mais perfis, roda depois do autenticar
export function autorizar(...perfis: Perfil[]) {
  // middleware que checa se o perfil do token ta na lista permitida
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      throw AppError.acessoNegado();
    }
    next();
  };
}
