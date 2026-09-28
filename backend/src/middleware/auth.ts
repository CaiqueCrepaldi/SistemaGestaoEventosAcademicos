import type { NextFunction, Request, Response } from "express";
import type { Perfil } from "../types/domain";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { verificarToken } from "../utils/jwt";
import { prisma } from "../db/prisma";

// exige Authorization: Bearer <token>, anexa os dados em req.usuario. Alem de assinatura/prazo,
// confere se a sessao nao foi invalidada depois de emitida (troca de senha, inativacao, exclusao
// — ver Usuario.versaoToken): por isso precisa ser async, consulta o banco a cada requisicao
export const autenticar = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw AppError.naoAutenticado("Token ausente. Envie o header Authorization: Bearer <token>.");
  }

  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = verificarToken(token);
  } catch {
    throw AppError.naoAutenticado();
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub }, select: { versaoToken: true } });
  // token sem "versaoToken" foi emitido antes desse controle existir — vale como versao 1
  // (o default de toda conta), entao ninguem e deslogado so por causa do deploy dessa feature
  if (!usuario || (payload.versaoToken ?? 1) !== usuario.versaoToken) {
    throw AppError.naoAutenticado("Sessão inválida. Faça login novamente.");
  }

  req.usuario = payload;
  next();
});

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
