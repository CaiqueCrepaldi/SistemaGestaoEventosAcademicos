import type { NextFunction, Request, Response } from "express";
import type { Perfil } from "../types/domain";
import { AppError } from "../errors/AppError";
import { verificarToken } from "../utils/jwt";

// Exige um token válido no header "Authorization: Bearer <token>". Se
// passar, anexa os dados do usuário em req.usuario pro resto da cadeia
// (autorizar() e os controllers) usar. Toda rota exceto login/registro/
// recuperação de senha passa por esse middleware primeiro.
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw AppError.naoAutenticado("Token ausente. Envie o header Authorization: Bearer <token>.");
  }

  const token = header.slice("Bearer ".length);
  try {
    req.usuario = verificarToken(token);
    next();
  } catch {
    // Cobre tanto assinatura inválida quanto token expirado — pro cliente,
    // os dois casos são resolvidos do mesmo jeito (fazer login de novo).
    throw AppError.naoAutenticado();
  }
}

// Restringe a rota a uma lista de perfis. Precisa rodar DEPOIS de
// autenticar() na cadeia de middlewares, já que depende de req.usuario
// já estar preenchido. Uso: router.post("/eventos", autenticar,
// autorizar("ADMINISTRADOR", "SECRETARIA"), controller.criar).
export function autorizar(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      throw AppError.acessoNegado();
    }
    next();
  };
}
