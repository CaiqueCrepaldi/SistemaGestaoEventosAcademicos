import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { env } from "../config/env";

// rede de seguranca pra erro de banco que nenhum service tratou explicitamente
// (os casos comuns — email/rgm duplicado, sala/palestrante em uso — ja viram AppError antes de chegar aqui)
function paraAppError(err: Prisma.PrismaClientKnownRequestError): AppError {
  if (err.code === "P2002") return AppError.conflito("REGISTRO_DUPLICADO", "Já existe um registro com esses dados.");
  if (err.code === "P2003") return AppError.conflito("CONFLITO_DEPENDENCIA", "Operação bloqueada por um vínculo existente.");
  if (err.code === "P2025") return AppError.naoEncontrado("REGISTRO_NAO_ENCONTRADO", "Registro não encontrado.");
  return new AppError(500, "ERRO_BANCO", "Erro ao acessar o banco de dados.");
}

// tem que ser o ultimo middleware registrado (assinatura de 4 parametros
// eh o que faz o express reconhecer como error handler)
// pega qualquer erro lançado nas rotas e devolve no formato padrao da api
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;

  const erroTratado = err instanceof Prisma.PrismaClientKnownRequestError ? paraAppError(err) : err;

  if (erroTratado instanceof AppError) {
    return res.status(erroTratado.status).json({
      timestamp,
      status: erroTratado.status,
      code: erroTratado.code,
      message: erroTratado.message,
      path,
      ...(erroTratado.errors ? { erros: erroTratado.errors } : {}),
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
