import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RequisitosSenha } from "../../components/ui/RequisitosSenha";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { authService } from "../../services/authService";
import { MENSAGEM_REGRA_SENHA, validarSenhaNova } from "../../utils/validacao";

const MENSAGEM_SEM_CONVITE = "Use o link enviado para o seu e-mail. Se ele venceu, peça um novo convite a quem criou a sua conta.";

// a chave do convite vem no endereco (#/primeiro-acesso?convite=...). Le uma vez, direto do hash
function conviteDoEndereco(): string {
  const consulta = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(consulta).get("convite")?.trim() ?? "";
}

// tela publica do primeiro acesso da equipe (professor ou secretaria), aberta SO pelo link do convite que a equipe manda por e-mail (nenhuma tela tem
// link pra ca). A chave sai do endereco assim que e lida (history.replaceState: nao fica no historico nem na
// URL copiada) e fica so na memoria da tela. Consultar a chave nao gasta o convite; ele so e usado quando
// a pessoa envia a senha (mesma regra e mesma lista do cadastro do aluno) e o aceite dos Termos. Sem
// convite, ou com convite invalido/vencido, so a mensagem — sem formulario
export function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // lido do endereco e guardado so aqui; depois disso o endereco ja nao tem a chave
  const [convite, setConvite] = useState(conviteDoEndereco);
  const [situacao, setSituacao] = useState<"verificando" | "valido" | "invalido">(convite ? "verificando" : "invalido");
  const [email, setEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limparAoEditar } = useErrosFormulario();

  // outro link de convite aberto com a tela ja aberta (so o "#" muda, a tela nao e montada de novo)
  useEffect(() => {
    const nova = conviteDoEndereco();
    if (nova) setConvite(nova);
  }, [location.search]);

  useEffect(() => {
    if (window.location.hash.includes("convite=")) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/primeiro-acesso`);
    }
    if (!convite) {
      setSituacao("invalido");
      return;
    }
    setSituacao("verificando");
    let descartar = false;
    authService
      .consultarConvite(convite)
      .then((resposta) => {
        if (descartar) return;
        setEmail(resposta.email);
        setSituacao("valido");
      })
      .catch(() => {
        if (!descartar) setSituacao("invalido");
      });
    return () => {
      descartar = true;
    };
  }, [convite]);

  async function concluir(e: FormEvent) {
    e.preventDefault();
    const faltando: ErrosFormulario = {};
    if (!novaSenha) faltando.novaSenha = "Crie a sua senha.";
    else if (!validarSenhaNova(novaSenha)) faltando.novaSenha = MENSAGEM_REGRA_SENHA;
    if (!confirmarSenha) faltando.confirmarSenha = "Repita a senha.";
    else if (novaSenha && confirmarSenha !== novaSenha) faltando.confirmarSenha = "As senhas não coincidem.";
    if (!aceite) faltando.aceiteLgpd = "Para ativar a conta, aceite os Termos de Uso.";
    if (mostrar(faltando)) return;

    setCarregando(true);
    try {
      await authService.primeiroAcesso({ convite, novaSenha, aceiteLgpd: aceite });
      toast.success("Conta ativada. Entre com seu e-mail e a nova senha.");
      navigate("/login", { replace: true });
    } catch (erro) {
      // senha fora da regra volta no campo; convite que venceu ou ja foi usado no meio do caminho: so a mensagem
      if (mostrarErroDaApi(erro)) return;
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ativar a conta.");
      setSituacao("invalido");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Primeiro acesso à sua conta</p>
        </div>

        {situacao === "verificando" && <p className="form-hint">Conferindo o convite…</p>}

        {situacao === "invalido" && (
          <p className="form-hint convite-invalido" role="alert">
            {MENSAGEM_SEM_CONVITE}
          </p>
        )}

        {situacao === "valido" && (
          <form onSubmit={concluir} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
            <p className="form-hint">Crie a sua senha e aceite os Termos de Uso para ativar a conta.</p>
            <LegendaObrigatorio />
            <Campo nome="email" rotulo="E-mail institucional">
              <input type="email" value={email} readOnly aria-readonly autoComplete="username" />
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
        )}

        <div className="login-links">
          <Link to="/login">Ir para o login</Link>
        </div>
      </div>
    </div>
  );
}
