import type { Perfil } from "../types";
import { toast } from "../components/ui/Toast";
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
  solicitarRecuperacaoSenha(identificador: string): Promise<SolicitarRecuperacaoResult>;
  confirmarRecuperacaoSenha(identificador: string, codigo: string, novaSenha: string): Promise<void>;
}

// token falso so pra ter uma string no lugar de jwt de verdade, sem assinatura nenhuma
function fakeJwt(usuarioId: string, perfil: Perfil): string {
  const payload = btoa(JSON.stringify({ sub: usuarioId, perfil, exp: Date.now() + 1000 * 60 * 60 * 8 }));
  return `mock.${payload}.jwt`;
}

const RECUPERACAO_KEY = "sgea:recuperacao-senha";

function buscarUsuarioPorIdentificador(identificador: string) {
  const usuarios = loadCollection("usuarios-v2", usuariosSeed);
  return usuarios.find((u) => u.emailLogin === identificador || u.rgm === identificador);
}

function lerCodigosPendentes(): Record<string, { codigo: string; expiraEm: number }> {
  return JSON.parse(localStorage.getItem(RECUPERACAO_KEY) ?? "{}");
}

const localAuthService: AuthService = {
  async login(emailLogin, senha) {
    const usuarios = loadCollection("usuarios-v2", usuariosSeed);
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

  async cadastrarAluno(dados) {
    const [usuarios, participantes] = await Promise.all([
      Promise.resolve(loadCollection("usuarios-v2", usuariosSeed)),
      participanteService.list(),
    ]);

    const duplicado =
      usuarios.some((u) => u.emailLogin === dados.emailInstitucional) ||
      participantes.some((p) => p.rgm === dados.rgm);
    if (duplicado) {
      await delay(undefined, 200);
      throw new ApiError(409, "RGM ou e-mail já cadastrado", "CADASTRO_DUPLICADO");
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
    saveCollection("usuarios-v2", [...usuarios, usuario]);

    await delay(undefined, 300);
  },

  async solicitarRecuperacaoSenha(identificador) {
    const usuario = buscarUsuarioPorIdentificador(identificador);
    if (!usuario) {
      await delay(undefined, 300);
      throw new ApiError(404, "Não encontramos conta com esse e-mail ou RGM.", "USUARIO_NAO_ENCONTRADO");
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const pendentes = lerCodigosPendentes();
    pendentes[usuario.id] = { codigo, expiraEm: Date.now() + 1000 * 60 * 15 };
    localStorage.setItem(RECUPERACAO_KEY, JSON.stringify(pendentes));
    // sem servidor de email no mock, o codigo aparece num aviso na tela
    toast.info(`Código de recuperação (demonstração) para ${usuario.emailLogin}: ${codigo}`);

    return delay({ codigoDemo: codigo }, 300);
  },

  async confirmarRecuperacaoSenha(identificador, codigo, novaSenha) {
    const usuario = buscarUsuarioPorIdentificador(identificador);
    if (!usuario) {
      await delay(undefined, 200);
      throw new ApiError(404, "Não encontramos conta com esse e-mail ou RGM.", "USUARIO_NAO_ENCONTRADO");
    }

    const pendentes = lerCodigosPendentes();
    const pendente = pendentes[usuario.id];
    if (!pendente || pendente.codigo !== codigo || pendente.expiraEm < Date.now()) {
      await delay(undefined, 200);
      throw new ApiError(422, "Código inválido ou expirado.", "CODIGO_INVALIDO");
    }

    const usuarios = loadCollection("usuarios-v2", usuariosSeed);
    saveCollection(
      "usuarios-v2",
      usuarios.map((u) => (u.id === usuario.id ? { ...u, senhaHash: novaSenha } : u)),
    );
    delete pendentes[usuario.id];
    localStorage.setItem(RECUPERACAO_KEY, JSON.stringify(pendentes));

    await delay(undefined, 300);
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
  cadastrarAluno(dados) {
    return api.post<void>("/auth/registro", dados);
  },
  solicitarRecuperacaoSenha(identificador) {
    return api.post<SolicitarRecuperacaoResult>("/auth/recuperacao-senha", { identificador });
  },
  confirmarRecuperacaoSenha(identificador, codigo, novaSenha) {
    return api.post<void>("/auth/recuperacao-senha/confirmar", { identificador, codigo, novaSenha });
  },
};

export const authService: AuthService = USE_MOCK ? localAuthService : httpAuthService;
