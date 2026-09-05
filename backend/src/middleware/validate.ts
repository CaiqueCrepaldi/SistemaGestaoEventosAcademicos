import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/AppError";

function paraErrosDeCampo(erro: ZodError) {
  return erro.issues.map((issue) => ({
    campo: issue.path.join(".") || "(corpo)",
    mensagem: issue.message,
  }));
}

// valida req.body contra o schema zod passado
// se for valido substitui req.body pelo resultado (ja com os transforms aplicados)
// se nao for, joga 422 com o detalhe de cada campo
// os any no ZodType sao de proposito, tem schema que transforma tipo de entrada != saida (eventoSchema por exemplo)
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
