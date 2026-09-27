import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { env } from "../config/env";
import { registrarAuditoria } from "../utils/auditoria";

// rede de seguranca pra erro de banco que nenhum service tratou explicitamente
// (os casos comuns — email/rgm duplicado, sala/palestrante em uso — ja viram AppError antes de chegar aqui)
function paraAppError(err: Prisma.PrismaClientKnownRequestError): AppError {
  if (err.code === "P2002") return AppError.conflito("REGISTRO_DUPLICADO", "Já existe um registro com esses dados.");
  if (err.code === "P2003") return AppError.conflito("CONFLITO_DEPENDENCIA", "Operação bloqueada por um vínculo existente.");
  if (err.code === "P2025") return AppError.naoEncontrado("REGISTRO_NAO_ENCONTRADO", "Registro não encontrado.");
  // sem esse log o codigo real do prisma se perde e o 500 generico fica impossivel de diagnosticar
  console.error("[erro-banco]", { code: err.code, meta: err.meta, message: err.message });
  return new AppError(500, "ERRO_BANCO", "Erro ao acessar o banco de dados.");
}

// corpo maior que o limite configurado em express.json({ limit: ... }) — o body-parser
// joga isso como erro generico (nao AppError), sem isso viraria 500 em vez de 413
function ehCorpoGrandeDemais(err: unknown): err is { status: number; type: string } {
  return typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.too.large";
}

// tem que ser o ultimo middleware registrado (assinatura de 4 parametros
// eh o que faz o express reconhecer como error handler)
// pega qualquer erro lançado nas rotas e devolve no formato padrao da api
export async function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;

  const erroTratado = err instanceof Prisma.PrismaClientKnownRequestError
    ? paraAppError(err)
    : ehCorpoGrandeDemais(err)
      ? new AppError(413, "CORPO_MUITO_GRANDE", "O corpo da requisição excede o tamanho máximo permitido.")
      : err;

  if (erroTratado instanceof AppError) {
    // usuario autenticado barrado (autorizar() ou regra de posse/check-in nos services): grava so
    // metodo + rota, sem query string (pode carregar busca com dado pessoal)
    if (erroTratado.code === "ACESSO_NEGADO" && req.usuario) {
      await registrarAuditoria(req.usuario.sub, "ACESSO_NEGADO", `${req.method} ${path.split("?")[0]}`);
    }

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
