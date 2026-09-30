import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";
import { normalizarRgm, validarEmail, validarNome, validarRgm } from "../../utils/validacao";

const DOMINIO_INSTITUCIONAL = "@alunos.umc.br";

const VAZIO = { nomeCompleto: "", rgm: "", emailInstitucional: "", senha: "" };

// validacao no navegador, so pra resposta rapida — o backend valida tudo de novo
function validarCliente(form: typeof VAZIO, confirmarSenha: string, aceite: boolean): ErrosFormulario {
  const erros: ErrosFormulario = {};

  if (!form.nomeCompleto.trim()) erros.nomeCompleto = "Informe o nome completo.";
  else if (!validarNome(form.nomeCompleto)) erros.nomeCompleto = "O nome deve conter apenas letras.";

  if (!form.rgm) erros.rgm = "Informe o RGM.";
  else if (!validarRgm(form.rgm)) erros.rgm = "O RGM deve ter exatamente 11 dígitos.";

  if (!form.emailInstitucional.trim()) erros.emailInstitucional = "Informe o e-mail institucional.";
  else if (!validarEmail(form.emailInstitucional) || !form.emailInstitucional.toLowerCase().endsWith(DOMINIO_INSTITUCIONAL)) {
    erros.emailInstitucional = `Use o e-mail institucional (termina com ${DOMINIO_INSTITUCIONAL}).`;
  }

  if (!form.senha) erros.senha = "Crie uma senha.";
  else if (form.senha.length < 8) erros.senha = "A senha deve ter no mínimo 8 caracteres.";

  if (!confirmarSenha) erros.confirmarSenha = "Repita a senha.";
  else if (form.senha && confirmarSenha !== form.senha) erros.confirmarSenha = "As senhas não coincidem.";

  if (!aceite) erros.aceiteLgpd = "Para criar a conta, aceite os Termos de Uso.";

  return erros;
}

// cadastro publico de aluno, cria conta e ja loga em seguida
export function CadastroPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(VAZIO);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limparAoEditar } = useErrosFormulario();

  // valida no cliente, manda pro backend e trata os erros possiveis
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (mostrar(validarCliente(form, confirmarSenha, aceite))) return;

    setCarregando(true);
    try {
      await authService.cadastrarAluno({ ...form, aceiteLgpd: aceite });
      await login(form.emailInstitucional, form.senha);
      navigate("/eventos");
    } catch (erro) {
      // 409 = rgm/email duplicado (vai no campo certo); 422 = erro de campo vindo do backend
      if (erro instanceof ApiError && erro.code === "EMAIL_DUPLICADO") mostrar({ emailInstitucional: erro.message });
      else if (erro instanceof ApiError && erro.code === "RGM_DUPLICADO") mostrar({ rgm: erro.message });
      else if (!mostrarErroDaApi(erro)) setErroGeral(erro instanceof Error ? erro.message : "Erro ao criar conta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Criar conta de usuário</p>
        </div>

        <form onSubmit={handleSubmit} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
          <LegendaObrigatorio />
          <Campo nome="nomeCompleto" rotulo="Nome completo" obrigatorio erro={erros.nomeCompleto}>
            <input value={form.nomeCompleto} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} autoComplete="name" autoFocus />
          </Campo>

          <Campo nome="rgm" rotulo="RGM" obrigatorio erro={erros.rgm} dica="11 dígitos, só números.">
            <input
              value={form.rgm}
              onChange={(e) => setForm({ ...form, rgm: normalizarRgm(e.target.value) })}
              inputMode="numeric"
              maxLength={11}
            />
          </Campo>

          <Campo nome="emailInstitucional" rotulo="E-mail institucional" obrigatorio erro={erros.emailInstitucional}>
            <input
              type="email"
              value={form.emailInstitucional}
              onChange={(e) => setForm({ ...form, emailInstitucional: e.target.value })}
              placeholder={`rgm${DOMINIO_INSTITUCIONAL}`}
              autoComplete="email"
            />
          </Campo>

          <Campo nome="senha" rotulo="Senha" obrigatorio erro={erros.senha} dica="Mínimo de 8 caracteres.">
            <PasswordInput value={form.senha} onChange={(senha) => setForm({ ...form, senha })} autoComplete="new-password" />
          </Campo>

          <Campo nome="confirmarSenha" rotulo="Confirmar senha" obrigatorio erro={erros.confirmarSenha}>
            <PasswordInput value={confirmarSenha} onChange={setConfirmarSenha} autoComplete="new-password" />
          </Campo>

          <div className={"campo-checkbox" + (erros.aceiteLgpd ? " field-invalido" : "")}>
            <label className="lgpd-consent">
              <input
                type="checkbox"
                name="aceiteLgpd"
                checked={aceite}
                onChange={(e) => setAceite(e.target.checked)}
                aria-invalid={erros.aceiteLgpd ? true : undefined}
                aria-required
                aria-describedby={erros.aceiteLgpd ? "aceiteLgpd-mensagem" : undefined}
              />
              <span>
                Li e aceito os <Link to="/termos-de-uso" target="_blank" rel="noopener noreferrer">Termos de Uso</Link> e estou
                ciente da <Link to="/politica-de-privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>.
                <MarcaObrigatorio />
              </span>
            </label>
            {erros.aceiteLgpd && (
              <p className="form-error" id="aceiteLgpd-mensagem">
                {erros.aceiteLgpd}
              </p>
            )}
          </div>

          {erroGeral && <p className="form-error">{erroGeral}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
            {carregando ? "Criando conta…" : "Criar conta"}
          </button>
        </form>

        <div className="login-links cadastro-login-link">
          <Link to="/login">Já tenho conta — entrar</Link>
        </div>
      </div>
    </div>
  );
}
