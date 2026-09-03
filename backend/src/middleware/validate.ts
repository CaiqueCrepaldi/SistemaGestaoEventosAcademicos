import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/AppError";

// Converte os "issues" do Zod (formato interno da biblioteca) pro formato
// { campo, mensagem } documentado em docs/api-contract.md pra erro 422.
function paraErrosDeCampo(erro: ZodError) {
  return erro.issues.map((issue) => ({
    campo: issue.path.join(".") || "(corpo)",
    mensagem: issue.message,
  }));
}

// Middleware genérico de validação: recebe um schema Zod e devolve um
// middleware que valida req.body contra ele. Se for válido, substitui
// req.body pelo resultado "parseado" (já com os tipos/coerções/transforms
// do schema aplicados — ex.: string de data virando Date e depois de volta
// pra string ISO, ver eventos.schemas.ts) e segue em frente. Se inválido,
// lança 422 VALIDACAO com o detalhe de cada campo que falhou.
// O terceiro parâmetro de ZodType (aqui deixado `any`) é o tipo de
// ENTRADA aceito pelo schema, que pode ser diferente do tipo de SAÍDA (T)
// quando o schema faz `.transform(...)` — sem isso o TypeScript reclama
// de schemas como o de Evento, que recebe uma string de data e devolve
// outra string (já formatada), mudando o formato mas não o tipo.
export function validarCorpo<T>(schema: ZodType<T, any, any>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      throw AppError.validacao("Dados inválidos.", paraErrosDeCampo(resultado.error));
    }
    req.body = resultado.data;
    next();
  };
}
