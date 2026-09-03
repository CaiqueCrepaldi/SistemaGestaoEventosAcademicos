import type { Perfil } from "./domain";

// Dado extraído do JWT e anexado em req.usuario pelo middleware de
// autenticação (ver middleware/auth.ts) — disponível em qualquer rota
// protegida, sem precisar decodificar o token de novo em cada controller.
export interface UsuarioAutenticado {
  sub: string; // id do Usuario
  perfil: Perfil;
  participanteId: string | null;
}

// "Declaration merging": estende o tipo Request do Express pra incluir o
// campo `usuario`, sem precisar de um cast manual (`req as any`) em todo
// controller que usa isso.
declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}
