import type { NextFunction, Request, Response } from "express";
import type { Perfil } from "../types/domain";
import { AppError } from "../errors/AppError";
import { verificarToken } from "../utils/jwt";

// exige Authorization: Bearer <token>, anexa os dados em req.usuario
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
    throw AppError.naoAutenticado();
  }
}

// restringe a rota a um ou mais perfis, roda depois do autenticar
export function autorizar(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      throw AppError.acessoNegado();
    }
    next();
  };
}
