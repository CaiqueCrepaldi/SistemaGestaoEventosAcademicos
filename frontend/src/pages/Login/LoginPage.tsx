import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface LocationState {
  emailPreenchido?: string;
  cadastroOk?: boolean;
  senhaRedefinida?: boolean;
}

export function LoginPage() {
  const { usuario, login, carregando, erro } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = useState(state.emailPreenchido ?? "admin@ifsp.edu.br");
  const [senha, setSenha] = useState(state.emailPreenchido ? "" : "admin123");

  if (usuario) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, senha);
      navigate("/");
    } catch {
      // já tratado no contexto
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="sidebar-brand-mark">SGEA</span>
          <p>Sistema de Gestão de Eventos Acadêmicos</p>
        </div>

        {state.cadastroOk && <p className="form-success">Conta criada! Faça login pra continuar.</p>}
        {state.senhaRedefinida && <p className="form-success">Senha redefinida. Faça login com a nova senha.</p>}

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
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>

          <div className="login-links">
            <Link to="/cadastro">Criar conta de aluno</Link>
            <Link to="/esqueci-senha">Esqueci minha senha</Link>
          </div>

          {erro && <p className="form-error">{erro}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="login-hint">
          <strong>Contas de demonstração</strong>
          <span>Administrador: admin@ifsp.edu.br / admin123</span>
          <span>Secretaria: secretaria@ifsp.edu.br / secretaria123</span>
          <span>Aluno: aluno@aluno.ifsp.edu.br / aluno123</span>
        </div>
      </div>
    </div>
  );
}
