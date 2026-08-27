import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";

const DOMINIO_INSTITUCIONAL = "@aluno.ifsp.edu.br";

const VAZIO = { nomeCompleto: "", rgm: "", emailInstitucional: "", senha: "" };

function validarCliente(form: typeof VAZIO, confirmarSenha: string): Record<string, string> {
  const erros: Record<string, string> = {};

  if (!form.emailInstitucional.toLowerCase().endsWith(DOMINIO_INSTITUCIONAL)) {
    erros.emailInstitucional = `E-mail precisa ser institucional (termina com ${DOMINIO_INSTITUCIONAL})`;
  }
  if (!/^\d{8,}$/.test(form.rgm)) {
    erros.rgm = "RGM deve conter só números, com no mínimo 8 dígitos";
  }
  if (form.senha.length < 6) {
    erros.senha = "Senha deve ter no mínimo 6 caracteres";
  } else if (form.senha !== confirmarSenha) {
    erros.confirmarSenha = "As senhas não coincidem";
  }

  return erros;
}

export function CadastroPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(VAZIO);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);

    const erros = validarCliente(form, confirmarSenha);
    setErrosCampo(erros);
    if (Object.keys(erros).length > 0) return;

    setCarregando(true);
    try {
      await authService.cadastrarAluno(form);
      await login(form.emailInstitucional, form.senha);
      navigate("/eventos");
    } catch (erro) {
      if (erro instanceof ApiError && erro.status === 409) {
        setErroGeral("RGM ou e-mail já cadastrado");
      } else if (erro instanceof ApiError && erro.status === 422 && erro.errors) {
        const campos: Record<string, string> = {};
        erro.errors.forEach((item) => {
          campos[item.campo] = item.mensagem;
        });
        setErrosCampo(campos);
      } else {
        setErroGeral(erro instanceof Error ? erro.message : "Erro ao criar conta");
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
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

          <div className="field">
            <label className="field">
              <span>RGM</span>
              <input value={form.rgm} onChange={(e) => setForm({ ...form, rgm: e.target.value })} required />
            </label>
            {errosCampo.rgm && <p className="form-error">{errosCampo.rgm}</p>}
          </div>

          <div className="field">
            <label className="field">
              <span>E-mail institucional</span>
              <input
                type="email"
                value={form.emailInstitucional}
                onChange={(e) => setForm({ ...form, emailInstitucional: e.target.value })}
                required
              />
            </label>
            {errosCampo.emailInstitucional && <p className="form-error">{errosCampo.emailInstitucional}</p>}
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field">
                <span>Senha</span>
                <input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  required
                />
              </label>
              {errosCampo.senha && <p className="form-error">{errosCampo.senha}</p>}
            </div>
            <div className="field">
              <label className="field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                />
              </label>
              {errosCampo.confirmarSenha && <p className="form-error">{errosCampo.confirmarSenha}</p>}
            </div>
          </div>

          {erroGeral && <p className="form-error">{erroGeral}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
            {carregando ? "Criando conta…" : "Criar conta"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/login">Já tenho conta — entrar</Link>
        </p>
      </div>
    </div>
  );
}
