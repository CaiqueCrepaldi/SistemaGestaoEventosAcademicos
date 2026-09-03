import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { env } from "../config/env";

// Formato de erro único pra toda a API, exatamente como documentado em
// docs/api-contract.md — qualquer erro lançado em qualquer rota (via
// `throw`, já que os controllers usam asyncHandler) acaba caindo aqui.
// Precisa ser o ÚLTIMO middleware registrado em app.ts (é a assinatura de
// 4 parâmetros que faz o Express reconhecer isso como error handler).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;

  // Caso esperado: um AppError que a própria aplicação lançou de propósito
  // (não encontrado, sem permissão, conflito, validação etc.). Toda regra
  // de integridade (duplicidade, vínculo entre registros) é checada à mão
  // nos services agora — sem um banco de verdade por trás, não tem
  // constraint nenhuma pegando isso "de graça".
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

  // Qualquer coisa não prevista é bug — loga o stack trace completo no
  // servidor (nunca no corpo da resposta, isso vazaria detalhe interno pro
  // cliente) e devolve um 500 genérico.
  console.error("[erro não tratado]", err);
  return res.status(500).json({
    timestamp,
    status: 500,
    code: "ERRO_INTERNO",
    message: env.isProduction ? "Erro interno do servidor." : String(err instanceof Error ? err.stack : err),
    path,
  });
}
