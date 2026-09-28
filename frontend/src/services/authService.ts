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

// login com 2FA ativo (ou equipe sem 2FA configurado) ainda nao abre sessao: devolve um token
// temporario que so serve pra etapa seguinte
export type ResultadoLogin =
  | { tipo: "sessao"; sessao: SessaoUsuario }
  | { tipo: "mfa_pendente" | "mfa_configuracao"; tokenEtapa: string };

export interface ConfiguracaoMfa {
  qrCode: string; // PNG em data URL, gerado no nosso servidor
  segredo: string; // pra digitar no aplicativo se nao der pra escanear
}

export interface ConfirmacaoMfa {
  codigosRecuperacao: string[];
  // so vem quando a configuracao foi a obrigatoria, no meio do login
  sessao?: SessaoUsuario;
}

export type CodigoSegundaEtapa = { codigo: string } | { codigoRecuperacao: string };

interface LoginResponseDTO {
  token: string;
  tokenType: string;
  expiresIn: number;
  usuario: UsuarioPerfil;
}

interface EtapaMfaDTO {
  mfa: "PENDENTE" | "CONFIGURACAO_OBRIGATORIA";
  tokenEtapa: string;
  expiresIn: number;
}

function paraSessao(res: LoginResponseDTO): SessaoUsuario {
  return { ...res.usuario, token: res.token, expiraEm: Date.now() + res.expiresIn * 1000 };
}

export const authService = {
  async login(emailLogin: string, senha: string): Promise<ResultadoLogin> {
    const res = await api.post<LoginResponseDTO | EtapaMfaDTO>("/auth/login", { emailLogin, senha });
    if ("mfa" in res) {
      return { tipo: res.mfa === "PENDENTE" ? "mfa_pendente" : "mfa_configuracao", tokenEtapa: res.tokenEtapa };
    }
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

  // sem tokenEtapa usa a sessao salva (aluno ativando); com tokenEtapa e a configuracao obrigatoria da equipe
  iniciarConfiguracaoMfa(tokenEtapa?: string) {
    return api.post<ConfiguracaoMfa>("/auth/2fa/configuracao", undefined, tokenEtapa);
  },

  async confirmarConfiguracaoMfa(codigo: string, tokenEtapa?: string): Promise<ConfirmacaoMfa> {
    const res = await api.post<{ codigosRecuperacao: string[]; sessao?: LoginResponseDTO }>(
      "/auth/2fa/configuracao/confirmar",
      { codigo },
      tokenEtapa,
    );
    return { codigosRecuperacao: res.codigosRecuperacao, sessao: res.sessao ? paraSessao(res.sessao) : undefined };
  },

  // devolve a sessao reemitida: as outras sessoes da conta sao encerradas no servidor
  async desativarMfa(senha: string, codigo: string): Promise<SessaoUsuario> {
    return paraSessao(await api.post<LoginResponseDTO>("/auth/2fa/desativar", { senha, codigo }));
  },

  obterMe() {
    return api.get<UsuarioPerfil>("/usuarios/me");
  },

  cadastrarAluno(dados: CadastroAlunoInput) {
    return api.post<void>("/auth/registro", dados);
  },
  solicitarRecuperacaoSenha(email: string) {
    return api.post<SolicitarRecuperacaoResult>("/auth/recuperacao-senha", { email });
  },
  confirmarRecuperacaoSenha(email: string, codigo: string, novaSenha: string) {
    return api.post<void>("/auth/recuperacao-senha/confirmar", { email, codigo, novaSenha });
  },
};
