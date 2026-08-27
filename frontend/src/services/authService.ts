import type { Perfil } from "../types";
import { ApiError, USE_MOCK, api } from "./api";
import { participanteService } from "./entityServices";
import { usuariosSeed } from "./seed";
import { delay, loadCollection, newId, saveCollection } from "./storage";

export interface UsuarioPerfil {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
}

export interface SessaoUsuario extends UsuarioPerfil {
  token: string;
}

export interface CadastroAlunoInput {
  nomeCompleto: string;
  rgm: string;
  emailInstitucional: string;
  senha: string;
}

interface AuthService {
  login(emailLogin: string, senha: string): Promise<SessaoUsuario>;
  registrarAluno(dados: CadastroAlunoInput): Promise<UsuarioPerfil>;
}

function fakeJwt(usuarioId: string, perfil: Perfil): string {
  const payload = btoa(JSON.stringify({ sub: usuarioId, perfil, exp: Date.now() + 1000 * 60 * 60 * 8 }));
  return `mock.${payload}.jwt`;
}

const localAuthService: AuthService = {
  async login(emailLogin, senha) {
    const usuarios = loadCollection("usuarios", usuariosSeed);
    const usuario = usuarios.find((u) => u.emailLogin === emailLogin && u.senhaHash === senha);
    if (!usuario) {
      await delay(undefined, 300);
      throw new ApiError(401, "E-mail ou senha inválidos", "CREDENCIAIS_INVALIDAS");
    }
    return delay(
      {
        id: usuario.id,
        nome: usuario.nome,
        emailLogin: usuario.emailLogin,
        perfil: usuario.perfil,
        rgm: usuario.rgm ?? null,
        participanteId: usuario.participanteId ?? null,
        token: fakeJwt(usuario.id, usuario.perfil),
      },
      300,
    );
  },

  async registrarAluno(dados) {
    const [usuarios, participantes] = await Promise.all([
      Promise.resolve(loadCollection("usuarios", usuariosSeed)),
      participanteService.list(),
    ]);

    if (usuarios.some((u) => u.emailLogin === dados.emailInstitucional)) {
      await delay(undefined, 200);
      throw new ApiError(409, "Já existe um cadastro com este e-mail.", "EMAIL_DUPLICADO");
    }
    if (participantes.some((p) => p.rgm === dados.rgm)) {
      await delay(undefined, 200);
      throw new ApiError(409, "Já existe um cadastro com este RGM.", "RGM_DUPLICADO");
    }

    const participante = await participanteService.create({
      nome: dados.nomeCompleto,
      email: dados.emailInstitucional,
      rgm: dados.rgm,
    });

    const usuario = {
      id: newId(),
      nome: dados.nomeCompleto,
      emailLogin: dados.emailInstitucional,
      senhaHash: dados.senha,
      perfil: "ALUNO" as const,
      rgm: dados.rgm,
      participanteId: participante.id,
    };
    saveCollection("usuarios", [...usuarios, usuario]);

    return delay(
      {
        id: usuario.id,
        nome: usuario.nome,
        emailLogin: usuario.emailLogin,
        perfil: usuario.perfil,
        rgm: usuario.rgm,
        participanteId: usuario.participanteId,
      },
      300,
    );
  },
};

interface LoginResponseDTO {
  token: string;
  tokenType: string;
  expiresIn: number;
  usuario: UsuarioPerfil;
}

const httpAuthService: AuthService = {
  async login(emailLogin, senha) {
    const res = await api.post<LoginResponseDTO>("/auth/login", { emailLogin, senha });
    return { ...res.usuario, token: res.token };
  },
  registrarAluno(dados) {
    return api.post<UsuarioPerfil>("/auth/registro", dados);
  },
};

export const authService: AuthService = USE_MOCK ? localAuthService : httpAuthService;
