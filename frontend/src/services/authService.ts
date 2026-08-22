import type { Perfil } from "../types";
import { delay, loadCollection } from "./storage";
import { usuariosSeed } from "./seed";

export interface SessaoUsuario {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  token: string;
}

function fakeJwt(usuarioId: string, perfil: Perfil): string {
  const payload = btoa(JSON.stringify({ sub: usuarioId, perfil, exp: Date.now() + 1000 * 60 * 60 * 8 }));
  return `mock.${payload}.jwt`;
}

async function login(emailLogin: string, senha: string): Promise<SessaoUsuario> {
  const usuarios = loadCollection("usuarios", usuariosSeed);
  const usuario = usuarios.find((u) => u.emailLogin === emailLogin && u.senhaHash === senha);
  if (!usuario) {
    return delay(undefined as never, 300).then(() => {
      throw new Error("E-mail ou senha inválidos");
    });
  }
  const sessao: SessaoUsuario = {
    id: usuario.id,
    nome: usuario.nome,
    emailLogin: usuario.emailLogin,
    perfil: usuario.perfil,
    token: fakeJwt(usuario.id, usuario.perfil),
  };
  return delay(sessao, 300);
}

export const authService = { login };
