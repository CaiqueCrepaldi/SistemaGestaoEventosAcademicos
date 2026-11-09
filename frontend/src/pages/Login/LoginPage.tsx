import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { VerificacaoMfa } from "../../components/mfa/VerificacaoMfa";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import type { SessaoUsuario } from "../../services/authService";

const MENSAGEM_ETAPA_EXPIRADA = "O tempo para informar o código acabou. Entre novamente.";

// tela de login em ate duas etapas: e-mail/senha e, se a pessoa ativou o 2FA, o codigo do
// aplicativo. Redireciona quando a sessao abre
export function LoginPage() {
  const { usuario, login, definirSessao, carregando, erro } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tokenEtapa, setTokenEtapa] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limparAoEditar } = useErrosFormulario();

  if (usuario) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    const faltando: ErrosFormulario = {};
    if (!email.trim()) faltando.emailLogin = "Informe o e-mail.";
    if (!senha) faltando.senha = "Informe a senha.";
    if (mostrar(faltando)) return;

    try {
      const resultado = await login(email, senha);
      if (resultado.tipo === "mfa_pendente") {
        setSenha("");
        setTokenEtapa(resultado.tokenEtapa);
      }
    } catch (erroLogin) {
      // credencial errada/bloqueio viram mensagem geral via AuthContext; 422 cai no campo
      mostrarErroDaApi(erroLogin);
    }
  }

  function voltarParaCredenciais(mensagem?: string) {
    setTokenEtapa(null);
    setAviso(mensagem ?? null);
  }

  function concluirVerificacao(sessao: SessaoUsuario, restantes?: number) {
    if (restantes !== undefined) {
      toast.info(`Você usou um código de recuperação. Restam ${restantes}.`);
    }
    definirSessao(sessao);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Universidade de Mogi das Cruzes — UMC</p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--gray-500)", margin: "4px 0 0" }}>
            Sistema de Gestão de Eventos Acadêmicos
          </p>
        </div>

        {tokenEtapa ? (
          <VerificacaoMfa
            tokenEtapa={tokenEtapa}
            onConcluir={concluirVerificacao}
            onExpirar={() => voltarParaCredenciais(MENSAGEM_ETAPA_EXPIRADA)}
            onVoltar={() => voltarParaCredenciais()}
          />
        ) : (
          <>
            <form onSubmit={handleSubmit} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
              <LegendaObrigatorio />
              <Campo nome="emailLogin" rotulo="E-mail institucional" obrigatorio erro={erros.emailLogin}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
              </Campo>
              <Campo nome="senha" rotulo="Senha" obrigatorio erro={erros.senha}>
                <PasswordInput value={senha} onChange={setSenha} autoComplete="current-password" />
              </Campo>

              {(erro || aviso) && <p className="form-error">{erro ?? aviso}</p>}

              <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
                {carregando ? "Entrando…" : "Entrar"}
              </button>
            </form>

            <div className="login-links">
              <Link to="/cadastro">Criar conta</Link>
              <Link to="/esqueci-senha">Esqueci minha senha</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
