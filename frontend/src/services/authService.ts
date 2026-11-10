import type { Perfil } from "../types";
import { api } from "./api";

export interface UsuarioPerfil {
  id: string;
  nome: string;
  emailLogin: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
  mfaAtivo: boolean;
}

// o que fica salvo em localStorage["sgea:session"] depois do login
export interface SessaoUsuario extends UsuarioPerfil {
  token: string;
  // Date.now() + expiresIn (o backend manda em segundos) — usado pra deslogar
  // proativamente sem esperar o servidor recusar a proxima chamada com 401
  expiraEm: number;
}

export interface CadastroAlunoInput {
  nomeCompleto: string;
  rgm: string;
  emailInstitucional: string;
  senha: string;
  aceiteLgpd: boolean;
}

export interface SolicitarRecuperacaoResult {
  codigoDemo?: string;
}

// resposta do cadastro (passo 1) e do reenvio: a conta ainda nao existe, o codigo foi pro e-mail
export interface EnvioCodigoCadastro {
  emailInstitucional: string;
  expiraEm: string;
  // so fora de producao, pra testar sem e-mail configurado
  codigoDemo?: string;
}

// login com 2FA ativo ainda nao abre sessao: devolve um token temporario que so serve pra etapa
// do codigo
export type ResultadoLogin = { tipo: "sessao"; sessao: SessaoUsuario } | { tipo: "mfa_pendente"; tokenEtapa: string };

export interface ConfiguracaoMfa {
  qrCode: string; // PNG em data URL, gerado no nosso servidor
  segredo: string; // pra digitar no aplicativo se nao der pra escanear
}

export interface ConfirmacaoMfa {
  codigosRecuperacao: string[];
}

export type CodigoSegundaEtapa = { codigo: string } | { codigoRecuperacao: string };

interface LoginResponseDTO {
  token: string;
  tokenType: string;
  expiresIn: number;
  usuario: UsuarioPerfil;
}

interface EtapaMfaDTO {
  mfa: "PENDENTE";
  tokenEtapa: string;
  expiresIn: number;
}

function paraSessao(res: LoginResponseDTO): SessaoUsuario {
  return { ...res.usuario, token: res.token, expiraEm: Date.now() + res.expiresIn * 1000 };
}

export const authService = {
  async login(emailLogin: string, senha: string): Promise<ResultadoLogin> {
    const res = await api.post<LoginResponseDTO | EtapaMfaDTO>("/auth/login", { emailLogin, senha });
    if ("mfa" in res) return { tipo: "mfa_pendente", tokenEtapa: res.tokenEtapa };
    return { tipo: "sessao", sessao: paraSessao(res) };
  },

  // segunda etapa do login: codigo do aplicativo ou codigo de recuperacao
  async verificarMfa(tokenEtapa: string, codigo: CodigoSegundaEtapa) {
    const res = await api.post<LoginResponseDTO & { codigosRecuperacaoRestantes?: number }>(
      "/auth/2fa/verificar",
      codigo,
      tokenEtapa,
    );
    return { sessao: paraSessao(res), codigosRecuperacaoRestantes: res.codigosRecuperacaoRestantes };
  },

  // ativacao opcional do 2FA na propria conta (qualquer perfil), em "Minha conta"
  iniciarConfiguracaoMfa() {
    return api.post<ConfiguracaoMfa>("/auth/2fa/configuracao");
  },

  confirmarConfiguracaoMfa(codigo: string): Promise<ConfirmacaoMfa> {
    return api.post<ConfirmacaoMfa>("/auth/2fa/configuracao/confirmar", { codigo });
  },

  // devolve a sessao reemitida: as outras sessoes da conta sao encerradas no servidor
  async desativarMfa(senha: string, codigo: string): Promise<SessaoUsuario> {
    return paraSessao(await api.post<LoginResponseDTO>("/auth/2fa/desativar", { senha, codigo }));
  },

  // troca de senha pela Minha Conta (qualquer perfil). Com o 2FA ativo vai junto o codigo do aplicativo ou um
  // codigo de recuperacao. Devolve a sessao reemitida: as outras sessoes da conta sao encerradas no servidor
  async alterarSenha(dados: {
    senhaAtual: string;
    novaSenha: string;
    confirmacaoSenha: string;
    codigo?: string;
    codigoRecuperacao?: string;
  }): Promise<SessaoUsuario> {
    return paraSessao(await api.post<LoginResponseDTO>("/auth/alterar-senha", dados));
  },

  obterMe() {
    return api.get<UsuarioPerfil>("/usuarios/me");
  },

  // cadastro em 2 passos: os dados (manda o codigo pro e-mail) e a confirmacao do codigo (cria a conta)
  cadastrarAluno(dados: CadastroAlunoInput) {
    return api.post<EnvioCodigoCadastro>("/auth/registro", dados);
  },
  confirmarCadastro(emailInstitucional: string, codigo: string) {
    return api.post<UsuarioPerfil>("/auth/registro/confirmar", { emailInstitucional, codigo });
  },
  reenviarCodigoCadastro(emailInstitucional: string) {
    return api.post<EnvioCodigoCadastro>("/auth/registro/reenviar-codigo", { emailInstitucional });
  },
  // primeiro acesso do professor pelo link do convite: a tela consulta a chave (so diz se vale e o e-mail da
  // conta, sem gastar o convite) e depois manda a chave + senha nova + aceite dos Termos
  consultarConvite(convite: string) {
    return api.post<{ email: string }>("/auth/primeiro-acesso/convite", { convite });
  },
  primeiroAcesso(dados: { convite: string; novaSenha: string; aceiteLgpd: boolean }) {
    return api.post<void>("/auth/primeiro-acesso", dados);
  },
  solicitarRecuperacaoSenha(email: string) {
    return api.post<SolicitarRecuperacaoResult>("/auth/recuperacao-senha", { email });
  },
  confirmarRecuperacaoSenha(email: string, codigo: string, novaSenha: string) {
    return api.post<void>("/auth/recuperacao-senha/confirmar", { email, codigo, novaSenha });
  },
};
