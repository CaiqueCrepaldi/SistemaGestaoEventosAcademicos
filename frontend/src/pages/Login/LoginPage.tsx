import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ConfiguracaoMfa } from "../../components/mfa/ConfiguracaoMfa";
import { VerificacaoMfa } from "../../components/mfa/VerificacaoMfa";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import type { SessaoUsuario } from "../../services/authService";

type Etapa =
  | { tipo: "credenciais" }
  | { tipo: "mfa_pendente"; tokenEtapa: string }
  | { tipo: "mfa_configuracao"; tokenEtapa: string };

const MENSAGEM_ETAPA_EXPIRADA = "O tempo para concluir a verificação acabou. Entre novamente.";

// tela de login em ate duas etapas: e-mail/senha e, se preciso, o 2FA (codigo ou configuracao
// obrigatoria da equipe). Redireciona quando a sessao abre
export function LoginPage() {
  const { usuario, login, definirSessao, carregando, erro } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "credenciais" });
  const [aviso, setAviso] = useState<string | null>(null);

  if (usuario) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    try {
      const resultado = await login(email, senha);
      if (resultado.tipo !== "sessao") {
        setSenha("");
        setEtapa({ tipo: resultado.tipo, tokenEtapa: resultado.tokenEtapa });
      }
    } catch {
      // erro ja vira mensagem na tela via AuthContext
    }
  }

  function voltarParaCredenciais(mensagem?: string) {
    setEtapa({ tipo: "credenciais" });
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
      <div className={"login-card" + (etapa.tipo === "mfa_configuracao" ? " mfa-login-card" : "")}>
        <div className="login-brand">
          <p>Universidade de Mogi das Cruzes — UMC</p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--gray-500)", margin: "4px 0 0" }}>
            Sistema de Gestão de Eventos Acadêmicos
          </p>
        </div>

        {etapa.tipo === "mfa_pendente" && (
          <VerificacaoMfa
            tokenEtapa={etapa.tokenEtapa}
            onConcluir={concluirVerificacao}
            onExpirar={() => voltarParaCredenciais(MENSAGEM_ETAPA_EXPIRADA)}
            onVoltar={() => voltarParaCredenciais()}
          />
        )}

        {etapa.tipo === "mfa_configuracao" && (
          <ConfiguracaoMfa
            tokenEtapa={etapa.tokenEtapa}
            obrigatoria
            onConcluir={(sessao) => {
              if (sessao) definirSessao(sessao);
              else voltarParaCredenciais();
            }}
            onCancelar={() => voltarParaCredenciais()}
            onExpirar={() => voltarParaCredenciais(MENSAGEM_ETAPA_EXPIRADA)}
          />
        )}

        {etapa.tipo === "credenciais" && (
          <>
            <form onSubmit={handleSubmit} className="form">
              <label className="field">
                <span>E-mail institucional</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Senha</span>
                <PasswordInput value={senha} onChange={setSenha} required />
              </label>

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
