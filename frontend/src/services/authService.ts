import type { Perfil } from "../types";
import { toast } from "../components/ui/Toast";
import { ApiError, USE_MOCK, api } from "./api";
import { participanteService } from "./entityServices";
import { usuariosSeed } from "./seed";
import { delay, loadCollection, newId, saveCollection } from "./storage";

// Dados do usuário sem o token — é o formato que vem dentro da resposta de
// login/registro.
export interface UsuarioPerfil {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
}

// O que fica salvo em localStorage["sgea:session"] depois do login — os
// dados do usuário mais o token, usado em toda chamada autenticada.
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

// Gera um "token" falso só pra ter alguma string no lugar de um JWT de
// verdade (que só existiria com backend real assinando). Não tem
// assinatura nem validação nenhuma — é só cosmético, pro modo mock imitar
// o formato Bearer <token>.
function fakeJwt(usuarioId: string, perfil: Perfil): string {
  const payload = btoa(JSON.stringify({ sub: usuarioId, perfil, exp: Date.now() + 1000 * 60 * 60 * 8 }));
  return `mock.${payload}.jwt`;
}

const RECUPERACAO_KEY = "sgea:recuperacao-senha";

// Acha um usuário tanto por e-mail quanto por RGM — usado no fluxo de
// "esqueci minha senha", que aceita os dois como identificador.
function buscarUsuarioPorIdentificador(identificador: string) {
  const usuarios = loadCollection("usuarios-v2", usuariosSeed);
  return usuarios.find((u) => u.emailLogin === identificador || u.rgm === identificador);
}

// Lê o "banco" de códigos de recuperação de senha pendentes (um por
// usuário) guardado em localStorage. Se ainda não existir nada, devolve um
// objeto vazio em vez de quebrar.
function lerCodigosPendentes(): Record<string, { codigo: string; expiraEm: number }> {
  return JSON.parse(localStorage.getItem(RECUPERACAO_KEY) ?? "{}");
}

const localAuthService: AuthService = {
  async login(emailLogin, senha) {
    const usuarios = loadCollection("usuarios-v2", usuariosSeed);
    const usuario = usuarios.find((u) => u.emailLogin === emailLogin && u.senhaHash === senha);
    // Se não achou ninguém com esse par e-mail/senha, é credencial errada —
    // devolve o mesmo erro genérico tanto pra e-mail inexistente quanto pra
    // senha errada, pra não dar dica de qual dos dois está incorreto.
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

    // Bloqueia cadastro duplicado: e-mail já usado como login OU RGM já
    // existente na lista de participantes (mesmo que seja de alguém sem
    // conta, cadastrado manualmente pelo admin).
    const duplicado =
      usuarios.some((u) => u.emailLogin === dados.emailInstitucional) ||
      participantes.some((p) => p.rgm === dados.rgm);
    if (duplicado) {
      await delay(undefined, 200);
      throw new ApiError(409, "RGM ou e-mail já cadastrado", "CADASTRO_DUPLICADO");
    }

    // Todo aluno precisa de dois registros vinculados: primeiro cria o
    // Participante (usado depois por inscrição/check-in/certificado)...
    const participante = await participanteService.create({
      nome: dados.nomeCompleto,
      email: dados.emailInstitucional,
      rgm: dados.rgm,
    });

    // ...e só depois o Usuario de login, já apontando pro id do
    // participante recém-criado.
    const usuario = {
      id: newId(),
      nome: dados.nomeCompleto,
      emailLogin: dados.emailInstitucional,
      senhaHash: dados.senha,
      perfil: "ALUNO" as const,
      rgm: dados.rgm,
      participanteId: participante.id,
    };
    saveCollection("usuarios-v2",[...usuarios, usuario]);

    await delay(undefined, 300);
  },

  async solicitarRecuperacaoSenha(identificador) {
    const usuario = buscarUsuarioPorIdentificador(identificador);
    if (!usuario) {
      await delay(undefined, 300);
      throw new ApiError(404, "Não encontramos conta com esse e-mail ou RGM.", "USUARIO_NAO_ENCONTRADO");
    }

    // Gera um código de 6 dígitos, válido por 15 minutos, e guarda
    // associado ao id do usuário (sobrescreve qualquer código anterior
    // ainda pendente pra ele).
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const pendentes = lerCodigosPendentes();
    pendentes[usuario.id] = { codigo, expiraEm: Date.now() + 1000 * 60 * 15 };
    localStorage.setItem(RECUPERACAO_KEY, JSON.stringify(pendentes));
    // Sem servidor de e-mail no mock, o código aparece num aviso na tela — e
    // também volta no corpo da resposta (codigoDemo), pra tela de recuperação
    // mostrar direto. Isso não existiria em produção (o código só chegaria
    // por e-mail de verdade).
    toast.info(`Código de recuperação (demonstração) para ${usuario.emailLogin}: ${codigo}`);

    return delay({ codigoDemo: codigo }, 300);
  },

  async confirmarRecuperacaoSenha(identificador, codigo, novaSenha) {
    const usuario = buscarUsuarioPorIdentificador(identificador);
    if (!usuario) {
      await delay(undefined, 200);
      throw new ApiError(404, "Não encontramos conta com esse e-mail ou RGM.", "USUARIO_NAO_ENCONTRADO");
    }

    // O código só é válido se existir, bater com o que foi digitado E
    // ainda não ter passado do prazo de expiração — qualquer uma dessas
    // três condições falhando já é código inválido.
    const pendentes = lerCodigosPendentes();
    const pendente = pendentes[usuario.id];
    if (!pendente || pendente.codigo !== codigo || pendente.expiraEm < Date.now()) {
      await delay(undefined, 200);
      throw new ApiError(422, "Código inválido ou expirado.", "CODIGO_INVALIDO");
    }

    // Código certo: troca a senha do usuário e descarta o código (não dá
    // pra reusar o mesmo código duas vezes).
    const usuarios = loadCollection("usuarios-v2", usuariosSeed);
    saveCollection(
      "usuarios",
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

// Versão que fala com o backend Java de verdade — cada método é só um POST
// pra rota correspondente (ver docs/api-contract.md pra formato de request/response).
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

// Troca entre mock e backend real conforme a variável de ambiente
// VITE_USE_MOCK — o resto do app usa `authService` sem saber qual dos dois é.
export const authService: AuthService = USE_MOCK ? localAuthService : httpAuthService;
