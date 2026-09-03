import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";
import { normalizarRgm, validarEmail, validarNome, validarRgm } from "../../utils/validacao";

const DOMINIO_INSTITUCIONAL = "@aluno.umc.br";

const VAZIO = { nomeCompleto: "", rgm: "", emailInstitucional: "", senha: "" };

// Validação feita no navegador, ANTES de mandar pro backend — serve só pra
// dar feedback rápido pro usuário (o backend valida tudo de novo, então
// aqui é só uma conveniência de UX, não a validação "de verdade").
// Cada `if` abaixo verifica uma regra independente e, se falhar, guarda a
// mensagem de erro no campo correspondente; no fim, `erros` só tem chave
// pros campos que realmente falharam.
function validarCliente(form: typeof VAZIO, confirmarSenha: string): Record<string, string> {
  const erros: Record<string, string> = {};

  // Regra 1: nome só com letras (sem número).
  if (!validarNome(form.nomeCompleto)) {
    erros.nomeCompleto = "Nome deve conter apenas letras.";
  }
  // Regra 2: e-mail precisa ser válido E terminar com o domínio institucional do aluno.
  if (!validarEmail(form.emailInstitucional) || !form.emailInstitucional.toLowerCase().endsWith(DOMINIO_INSTITUCIONAL)) {
    erros.emailInstitucional = `E-mail precisa ser institucional (termina com ${DOMINIO_INSTITUCIONAL})`;
  }
  // Regra 3: RGM com exatamente 11 caracteres alfanuméricos (já normalizado
  // pra maiúsculo/sem espaço no onChange do campo).
  if (!validarRgm(form.rgm)) {
    erros.rgm = "RGM deve ter exatamente 11 caracteres, sem espaços.";
  }
  // Regra 4: senha tem duas condições encadeadas com if/else — só faz
  // sentido checar se as duas senhas coincidem depois de já confirmar que
  // a senha em si tem tamanho mínimo válido.
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

    // Primeiro roda a validação local; se tiver qualquer erro, nem chega a
    // chamar o backend — só mostra os erros e para por aqui.
    const erros = validarCliente(form, confirmarSenha);
    setErrosCampo(erros);
    if (Object.keys(erros).length > 0) {
      toast.error("Corrija os campos destacados antes de continuar.");
      return;
    }

    setCarregando(true);
    try {
      // Cadastro e login são dois passos separados: cria a conta e, se deu
      // certo, já loga automaticamente com a senha que acabou de escolher.
      await authService.cadastrarAluno(form);
      await login(form.emailInstitucional, form.senha);
      navigate("/eventos");
    } catch (erro) {
      // Cada tipo de erro do backend cai num tratamento diferente:
      // 409 = RGM/e-mail duplicado (mensagem genérica no topo do form);
      // 422 = erro de validação por campo (backend manda campo + mensagem,
      //   e aqui isso é convertido pro mesmo formato que erro local usa);
      // qualquer outro caso = mensagem genérica de erro.
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
              <input
                value={form.rgm}
                onChange={(e) => setForm({ ...form, rgm: normalizarRgm(e.target.value) })}
                placeholder="11 caracteres, sem espaços"
                maxLength={11}
                required
              />
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
