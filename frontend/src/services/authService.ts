import type { Perfil } from "../types";
import { api } from "./api";

export interface UsuarioPerfil {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
}

// o que fica salvo em localStorage["sgea:session"] depois do login
export interface SessaoUsuario extends UsuarioPerfil {
  token: string;
}

export interface CadastroAlunoInput {
  nomeCompleto: string;
  rgm: string;
  emailInstitucional: string;
  senha: string;
}

export interface SolicitarRecuperacaoResult {
  codigoDemo?: string;
}

interface AuthService {
  login(emailLogin: string, senha: string): Promise<SessaoUsuario>;
  cadastrarAluno(dados: CadastroAlunoInput): Promise<void>;
  solicitarRecuperacaoSenha(email: string): Promise<SolicitarRecuperacaoResult>;
  confirmarRecuperacaoSenha(email: string, codigo: string, novaSenha: string): Promise<void>;
}

interface LoginResponseDTO {
  token: string;
  tokenType: string;
  expiresIn: number;
  usuario: UsuarioPerfil;
}

export const authService: AuthService = {
  async login(emailLogin, senha) {
    const res = await api.post<LoginResponseDTO>("/auth/login", { emailLogin, senha });
    return { ...res.usuario, token: res.token };
  },
  cadastrarAluno(dados) {
    return api.post<void>("/auth/registro", dados);
  },
  solicitarRecuperacaoSenha(email) {
    return api.post<SolicitarRecuperacaoResult>("/auth/recuperacao-senha", { email });
  },
  confirmarRecuperacaoSenha(email, codigo, novaSenha) {
    return api.post<void>("/auth/recuperacao-senha/confirmar", { email, codigo, novaSenha });
  },
};
