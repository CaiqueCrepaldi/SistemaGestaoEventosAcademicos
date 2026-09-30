import type { Perfil } from "./domain";

// dado extraido do jwt, anexado em req.usuario pelo middleware de auth
export interface UsuarioAutenticado {
  sub: string; // id do Usuario
  perfil: Perfil;
  participanteId: string | null;
  // versao de Usuario.versaoToken no momento do login; ausente (token emitido antes desse
  // campo existir) e tratado como 1, o valor inicial de toda conta — ver middleware autenticar
  versaoToken?: number;
}

// token temporario do login em duas etapas: "mfa_pendente" so serve pra rota de verificar o codigo
export type TipoTokenEtapa = "mfa_pendente";

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
      // preenchido so pelos middlewares das rotas do 2FA quando a chamada veio com token de etapa
      etapaMfa?: { usuarioId: string; tipo: TipoTokenEtapa };
    }
  }
}
