import type { NextFunction, Request, Response } from "express";

type RotaAsync = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// O Express (na versão 4, que é a usada aqui) não sabe lidar sozinho com
// erro de uma função async: se um `await` dentro do controller rejeitar, a
// exceção vira uma Promise rejeitada "solta" e nunca chega no
// errorHandler. Esse wrapper resolve isso: captura qualquer rejeição com
// `.catch(next)` e entrega pro Express tratar como erro normal.
// Sem isso, todo controller precisaria de um try/catch manual repetitivo.
export function asyncHandler(fn: RotaAsync) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
