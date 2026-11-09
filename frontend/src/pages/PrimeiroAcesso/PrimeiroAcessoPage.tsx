import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RequisitosSenha } from "../../components/ui/RequisitosSenha";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { authService } from "../../services/authService";
import { MENSAGEM_REGRA_SENHA, validarEmail, validarSenhaNova } from "../../utils/validacao";

// tela publica do professor: a equipe cria a conta (nome + e-mail @umc.br) e o sistema manda um codigo de
// 6 digitos. Aqui ele informa o codigo, define a senha (mesma regra e mesma lista do cadastro do aluno) e
// aceita os Termos — so entao a conta fica ativa. O erro e sempre o mesmo para e-mail sem conta ou codigo
// errado, pra nao revelar quais e-mails existem
export function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limparAoEditar } = useErrosFormulario();

  async function concluir(e: FormEvent) {
    e.preventDefault();
    const faltando: ErrosFormulario = {};
    if (!email.trim()) faltando.email = "Informe o seu e-mail institucional.";
    else if (!validarEmail(email)) faltando.email = "Informe um e-mail válido.";
    if (!codigo) faltando.codigo = "Informe o código recebido por e-mail.";
    else if (!/^[0-9]{6}$/.test(codigo)) faltando.codigo = "O código tem 6 dígitos.";
    if (!novaSenha) faltando.novaSenha = "Crie a sua senha.";
    else if (!validarSenhaNova(novaSenha)) faltando.novaSenha = MENSAGEM_REGRA_SENHA;
    if (!confirmarSenha) faltando.confirmarSenha = "Repita a senha.";
    else if (novaSenha && confirmarSenha !== novaSenha) faltando.confirmarSenha = "As senhas não coincidem.";
    if (!aceite) faltando.aceiteLgpd = "Para ativar a conta, aceite os Termos de Uso.";
    if (mostrar(faltando)) return;

    setCarregando(true);
    try {
      await authService.primeiroAcesso({ email: email.trim(), codigo, novaSenha, aceiteLgpd: aceite });
      toast.success("Conta ativada. Entre com seu e-mail e a nova senha.");
      navigate("/login");
    } catch (erro) {
      // codigo invalido/expirado ou excesso de tentativas: a mensagem (generica) fica embaixo do campo do codigo
      if (!mostrarErroDaApi(erro)) mostrar({ codigo: erro instanceof Error ? erro.message : "Não foi possível ativar a conta." });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Primeiro acesso do professor</p>
        </div>

        <form onSubmit={concluir} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
          <p className="form-hint">
            A equipe criou a sua conta e enviou um código de 6 dígitos para o seu e-mail institucional (vale por 24 horas).
            Informe o código, crie a sua senha e aceite os Termos para ativar a conta.
          </p>
          <LegendaObrigatorio />
          <Campo nome="email" rotulo="E-mail institucional" obrigatorio erro={erros.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@umc.br" autoFocus />
          </Campo>

          <Campo nome="codigo" rotulo="Código recebido por e-mail" obrigatorio erro={erros.codigo}>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </Campo>

          <Campo nome="novaSenha" rotulo="Nova senha" obrigatorio erro={erros.novaSenha}>
            <PasswordInput value={novaSenha} onChange={setNovaSenha} autoComplete="new-password" />
          </Campo>
          <RequisitosSenha senha={novaSenha} />

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

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={carregando || !aceite}
            title={aceite ? undefined : "Aceite os Termos de Uso para ativar a conta"}
          >
            {carregando ? "Ativando…" : "Ativar conta"}
          </button>
        </form>

        <div className="login-links">
          <Link to="/login">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
}
