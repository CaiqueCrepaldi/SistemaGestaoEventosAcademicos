import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";

export function EsqueciSenhaPage() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<"identificar" | "confirmar">("identificar");
  const [identificador, setIdentificador] = useState("");
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function solicitarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await authService.solicitarRecuperacaoSenha(identificador);
      setCodigoDemo(res.codigoDemo ?? null);
      setEtapa("confirmar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao solicitar recuperação");
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarNovaSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);
    try {
      await authService.confirmarRecuperacaoSenha(identificador, codigo, novaSenha);
      navigate("/login", { state: { emailPreenchido: identificador, senhaRedefinida: true } });
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
          <span className="sidebar-brand-mark">SGEA</span>
          <p>Recuperar senha</p>
        </div>

        {etapa === "identificar" && (
          <form onSubmit={solicitarCodigo} className="form">
            <p className="form-hint">Informe seu e-mail institucional ou RGM. Vamos enviar um código de verificação.</p>
            <label className="field">
              <span>E-mail ou RGM</span>
              <input
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
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
            {codigoDemo && <p className="form-success">Modo demonstração — código: {codigoDemo}</p>}

            <label className="field">
              <span>Código de verificação</span>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Nova senha</span>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Confirmar nova senha</span>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                />
              </label>
            </div>

            {erro && <p className="form-error">{erro}</p>}

            <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
              {carregando ? "Redefinindo…" : "Redefinir senha"}
            </button>
          </form>
        )}

        <div className="login-links" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link to="/login">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
}
