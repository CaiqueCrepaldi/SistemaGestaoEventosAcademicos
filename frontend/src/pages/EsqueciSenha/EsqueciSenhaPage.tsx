import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { authService } from "../../services/authService";
import { validarEmail } from "../../utils/validacao";

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
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  // pede o codigo de recuperacao e avanca pra etapa de confirmacao
  async function solicitarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!email.trim()) return void mostrar({ email: "Informe o e-mail cadastrado." });
    if (!validarEmail(email)) return void mostrar({ email: "Informe um e-mail válido." });

    setCarregando(true);
    try {
      const res = await authService.solicitarRecuperacaoSenha(email);
      setCodigoDemo(res.codigoDemo ?? null);
      limpar();
      setEtapa("confirmar");
    } catch (e) {
      if (!mostrarErroDaApi(e)) setErro(e instanceof Error ? e.message : "Erro ao solicitar recuperação.");
    } finally {
      setCarregando(false);
    }
  }

  // confere codigo + senha e troca a senha de fato
  async function confirmarNovaSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const faltando: ErrosFormulario = {};
    if (!codigo.trim()) faltando.codigo = "Informe o código recebido por e-mail.";
    if (!novaSenha) faltando.novaSenha = "Crie a nova senha.";
    else if (novaSenha.length < 8) faltando.novaSenha = "A senha deve ter no mínimo 8 caracteres.";
    if (!confirmarSenha) faltando.confirmarSenha = "Repita a nova senha.";
    else if (novaSenha && confirmarSenha !== novaSenha) faltando.confirmarSenha = "As senhas não coincidem.";
    if (mostrar(faltando)) return;

    setCarregando(true);
    try {
      await authService.confirmarRecuperacaoSenha(email, codigo, novaSenha);
      toast.success("Senha redefinida. Entre com a nova senha.");
      navigate("/login");
    } catch (e) {
      if (!mostrarErroDaApi(e)) setErro(e instanceof Error ? e.message : "Erro ao redefinir senha.");
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
          <form onSubmit={solicitarCodigo} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
            <p className="form-hint">Informe o e-mail cadastrado na sua conta. Vamos enviar um código de verificação.</p>
            <LegendaObrigatorio />
            <Campo nome="email" rotulo="E-mail cadastrado" obrigatorio erro={erros.email}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            </Campo>

            {erro && <p className="form-error">{erro}</p>}

            <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
              {carregando ? "Enviando…" : "Enviar código"}
            </button>
          </form>
        )}

        {etapa === "confirmar" && (
          <form onSubmit={confirmarNovaSenha} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
            <p className="form-hint">Digite o código enviado e escolha uma nova senha.</p>
            {codigoDemo && <p className="form-hint">Modo demonstração — código: {codigoDemo}</p>}
            <LegendaObrigatorio />

            <Campo nome="codigo" rotulo="Código de verificação" obrigatorio erro={erros.codigo}>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus />
            </Campo>

            <Campo nome="novaSenha" rotulo="Nova senha" obrigatorio erro={erros.novaSenha} dica="Mínimo de 8 caracteres.">
              <PasswordInput value={novaSenha} onChange={setNovaSenha} autoComplete="new-password" />
            </Campo>

            <Campo nome="confirmarSenha" rotulo="Confirmar nova senha" obrigatorio erro={erros.confirmarSenha}>
              <PasswordInput value={confirmarSenha} onChange={setConfirmarSenha} autoComplete="new-password" />
            </Campo>

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
