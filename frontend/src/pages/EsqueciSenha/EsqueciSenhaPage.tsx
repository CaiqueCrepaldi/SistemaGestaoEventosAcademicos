import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { authService } from "../../services/authService";

// fluxo de 2 etapas: pedir codigo pelo e-mail cadastrado, depois confirmar codigo + nova senha
export function EsqueciSenhaPage() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<"identificar" | "confirmar">("identificar");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // pede o codigo de recuperacao e avanca pra etapa de confirmacao
  async function solicitarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await authService.solicitarRecuperacaoSenha(email);
      setCodigoDemo(res.codigoDemo ?? null);
      setEtapa("confirmar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao solicitar recuperação");
    } finally {
      setCarregando(false);
    }
  }

  // confere codigo + senha e troca a senha de fato
  async function confirmarNovaSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);
    try {
      await authService.confirmarRecuperacaoSenha(email, codigo, novaSenha);
      navigate("/login");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao redefinir senha");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Recuperar senha</p>
        </div>

        {etapa === "identificar" && (
          <form onSubmit={solicitarCodigo} className="form">
            <p className="form-hint">Informe o e-mail cadastrado na sua conta. Vamos enviar um código de verificação.</p>
            <label className="field">
              <span>E-mail cadastrado</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>

            {erro && <p className="form-error">{erro}</p>}

            <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
              {carregando ? "Enviando…" : "Enviar código"}
            </button>
          </form>
        )}

        {etapa === "confirmar" && (
          <form onSubmit={confirmarNovaSenha} className="form">
            <p className="form-hint">Digite o código enviado e escolha uma nova senha.</p>
            {codigoDemo && <p className="form-hint">Modo demonstração — código: {codigoDemo}</p>}

            <label className="field">
              <span>Código de verificação</span>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Nova senha</span>
                <PasswordInput value={novaSenha} onChange={setNovaSenha} required />
              </label>
              <label className="field">
                <span>Confirmar nova senha</span>
                <PasswordInput value={confirmarSenha} onChange={setConfirmarSenha} required />
              </label>
            </div>

            {erro && <p className="form-error">{erro}</p>}

            <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
              {carregando ? "Redefinindo…" : "Redefinir senha"}
            </button>
          </form>
        )}

        <div className="login-links">
          <Link to="/login">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
}
