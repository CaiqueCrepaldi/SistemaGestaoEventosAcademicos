import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";

const VAZIO = { nomeCompleto: "", rgm: "", emailInstitucional: "", telefone: "", senha: "" };

export function CadastroPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(VAZIO);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (form.senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);
    try {
      await authService.registrarAluno(form);
      navigate("/login", { state: { emailPreenchido: form.emailInstitucional, cadastroOk: true } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card wide">
        <div className="login-brand">
          <span className="sidebar-brand-mark">SGEA</span>
          <p>Criar conta de aluno</p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Nome completo</span>
            <input
              value={form.nomeCompleto}
              onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
              required
              autoFocus
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>RGM</span>
              <input value={form.rgm} onChange={(e) => setForm({ ...form, rgm: e.target.value })} required />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(11) 91234-5678"
                required
              />
            </label>
          </div>

          <label className="field">
            <span>E-mail institucional</span>
            <input
              type="email"
              value={form.emailInstitucional}
              onChange={(e) => setForm({ ...form, emailInstitucional: e.target.value })}
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Confirmar senha</span>
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
            {carregando ? "Criando conta…" : "Criar conta"}
          </button>
        </form>

        <div className="login-links" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link to="/login">Já tenho conta — entrar</Link>
        </div>
      </div>
    </div>
  );
}
