import type { NextFunction, Request, Response } from "express";

type RotaAsync = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// express 4 nao pega erro de async sozinho, entao qualquer await que rejeitar
// vira promise solta e nunca chega no errorHandler
// esse wrapper joga o catch pro next() automaticamente
export function asyncHandler(fn: RotaAsync) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
