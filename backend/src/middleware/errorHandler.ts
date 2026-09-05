import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { env } from "../config/env";

// tem que ser o ultimo middleware registrado (assinatura de 4 parametros
// eh o que faz o express reconhecer como error handler)
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;

  if (err instanceof AppError) {
    return res.status(err.status).json({
      timestamp,
      status: err.status,
      code: err.code,
      message: err.message,
      path,
      ...(err.errors ? { erros: err.errors } : {}),
    });
  }

  // erro nao previsto, loga o stack no servidor e devolve 500 generico
  console.error("[erro não tratado]", err);
  return res.status(500).json({
    timestamp,
    status: 500,
    code: "ERRO_INTERNO",
    message: env.isProduction ? "Erro interno do servidor." : String(err instanceof Error ? err.stack : err),
    path,
  });
}
