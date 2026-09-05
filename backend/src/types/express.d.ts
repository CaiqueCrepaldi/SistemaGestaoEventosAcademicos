import type { Perfil } from "./domain";

// dado extraido do jwt, anexado em req.usuario pelo middleware de auth
export interface UsuarioAutenticado {
  sub: string; // id do Usuario
  perfil: Perfil;
  participanteId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}
