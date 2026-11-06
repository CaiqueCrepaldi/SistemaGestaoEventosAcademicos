import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RequisitosSenha } from "../../components/ui/RequisitosSenha";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError } from "../../services/api";
import { authService, type EnvioCodigoCadastro } from "../../services/authService";
import { MENSAGEM_REGRA_SENHA, normalizarRgm, validarEmail, validarNome, validarRgm, validarSenhaNova } from "../../utils/validacao";

const DOMINIO_INSTITUCIONAL = "@alunos.umc.br";
// mesmo intervalo minimo do backend entre um envio de codigo e o proximo
const INTERVALO_REENVIO_S = 60;

const VAZIO = { nomeCompleto: "", rgm: "", emailInstitucional: "", senha: "" };

// validacao no navegador, so pra resposta rapida — o backend valida tudo de novo
function validarCliente(form: typeof VAZIO, confirmarSenha: string, aceite: boolean): ErrosFormulario {
  const erros: ErrosFormulario = {};

  if (!form.nomeCompleto.trim()) erros.nomeCompleto = "Informe o nome completo.";
  else if (!validarNome(form.nomeCompleto)) erros.nomeCompleto = "O nome deve conter apenas letras.";

  if (!form.rgm) erros.rgm = "Informe o RGM.";
  else if (!validarRgm(form.rgm)) erros.rgm = "O RGM deve ter exatamente 11 dígitos.";

  if (!form.emailInstitucional.trim()) erros.emailInstitucional = "Informe o e-mail institucional.";
  else if (!validarEmail(form.emailInstitucional) || !form.emailInstitucional.trim().toLowerCase().endsWith(DOMINIO_INSTITUCIONAL)) {
    erros.emailInstitucional = `Use o e-mail institucional (termina com ${DOMINIO_INSTITUCIONAL}).`;
  }

  if (!form.senha) erros.senha = "Crie uma senha.";
  else if (!validarSenhaNova(form.senha)) erros.senha = MENSAGEM_REGRA_SENHA;

  if (!confirmarSenha) erros.confirmarSenha = "Repita a senha.";
  else if (form.senha && confirmarSenha !== form.senha) erros.confirmarSenha = "As senhas não coincidem.";

  if (!aceite) erros.aceiteLgpd = "Para criar a conta, aceite os Termos de Uso.";

  return erros;
}

// segundos que faltam, quando o backend recusa o reenvio por ser cedo demais ("Aguarde 42 segundos...")
function segundosDaMensagem(mensagem: string): number | null {
  const achado = /(\d+) segundos?/.exec(mensagem);
  return achado ? Number(achado[1]) : null;
}

// cadastro publico de aluno em 2 etapas: os dados e, depois, o codigo enviado ao e-mail institucional.
// A conta so passa a existir quando o codigo confere; ai entra direto no sistema
export function CadastroPage() {
  const { definirSessao } = useAuth();
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<"dados" | "codigo">("dados");
  const [form, setForm] = useState(VAZIO);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [envio, setEnvio] = useState<EnvioCodigoCadastro | null>(null);
  const [codigo, setCodigo] = useState("");
  const [segundosReenvio, setSegundosReenvio] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  // contagem regressiva do "Reenviar codigo"
  useEffect(() => {
    if (segundosReenvio <= 0) return;
    const espera = setTimeout(() => setSegundosReenvio((s) => s - 1), 1000);
    return () => clearTimeout(espera);
  }, [segundosReenvio]);

  function irParaCodigo(dadosDoEnvio: EnvioCodigoCadastro) {
    setEnvio(dadosDoEnvio);
    setCodigo("");
    setSegundosReenvio(INTERVALO_REENVIO_S);
    limpar();
    setEtapa("codigo");
  }

  // etapa 1: valida no cliente e manda os dados; o backend guarda o cadastro e envia o codigo
  async function enviarDados(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    if (mostrar(validarCliente(form, confirmarSenha, aceite))) return;

    setCarregando(true);
    try {
      irParaCodigo(await authService.cadastrarAluno({ ...form, aceiteLgpd: aceite }));
    } catch (erro) {
      // 409 = rgm/email duplicado (vai no campo certo); 422 = erro de campo vindo do backend
      if (erro instanceof ApiError && erro.code === "EMAIL_DUPLICADO") mostrar({ emailInstitucional: erro.message });
      else if (erro instanceof ApiError && erro.code === "RGM_DUPLICADO") mostrar({ rgm: erro.message });
      else if (erro instanceof ApiError && erro.code === "EMAIL_INDISPONIVEL") {
        // o cadastro ficou guardado, so o e-mail nao saiu: segue pra etapa do codigo e o aluno usa "Reenviar codigo"
        irParaCodigo({ emailInstitucional: form.emailInstitucional.trim().toLowerCase(), expiraEm: "" });
        mostrar({ codigo: erro.message });
      } else if (!mostrarErroDaApi(erro)) setErroGeral(erro instanceof Error ? erro.message : "Erro ao criar conta.");
    } finally {
      setCarregando(false);
    }
  }

  // entra com o e-mail e a senha que a pessoa acabou de criar. Se nao der, a conta ja existe: vai pro login
  async function entrarNaContaNova() {
    try {
      const resultado = await authService.login(form.emailInstitucional, form.senha);
      if (resultado.tipo === "sessao") {
        definirSessao(resultado.sessao);
        navigate("/eventos");
        return;
      }
    } catch {
      // cai no login logo abaixo
    }
    toast.success("Conta criada. Entre com seu e-mail e senha.");
    navigate("/login");
  }

  // etapa 2: confere o codigo; com o codigo certo o backend cria a conta
  async function confirmarCodigo(e: FormEvent) {
    e.preventDefault();
    if (!envio) return;
    if (!codigo) return void mostrar({ codigo: "Informe o código recebido por e-mail." });
    if (!/^[0-9]{6}$/.test(codigo)) return void mostrar({ codigo: "O código tem 6 dígitos." });

    setCarregando(true);
    try {
      await authService.confirmarCadastro(envio.emailInstitucional, codigo);
      await entrarNaContaNova();
    } catch (erro) {
      // codigo invalido/expirado, conta criada por outra pessoa nesse meio tempo: tudo embaixo do campo
      if (!mostrarErroDaApi(erro)) mostrar({ codigo: erro instanceof Error ? erro.message : "Não foi possível confirmar o código." });
    } finally {
      setCarregando(false);
    }
  }

  async function reenviarCodigo() {
    if (!envio || segundosReenvio > 0) return;
    setReenviando(true);
    try {
      const novoEnvio = await authService.reenviarCodigoCadastro(envio.emailInstitucional);
      setEnvio(novoEnvio);
      setCodigo("");
      setSegundosReenvio(INTERVALO_REENVIO_S);
      limpar();
      toast.success("Enviamos um novo código. O anterior não vale mais.");
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Não foi possível reenviar o código.";
      if (erro instanceof ApiError && erro.code === "AGUARDE_REENVIO") setSegundosReenvio(segundosDaMensagem(mensagem) ?? INTERVALO_REENVIO_S);
      // o pendente ficou guardado mesmo sem o e-mail sair: o aluno pode tentar de novo daqui a 60 s
      if (erro instanceof ApiError && erro.code === "EMAIL_INDISPONIVEL") setSegundosReenvio(INTERVALO_REENVIO_S);
      mostrar({ codigo: mensagem });
    } finally {
      setReenviando(false);
    }
  }

  // volta pra etapa 1 com tudo o que foi digitado (ao reenviar os dados, o backend gera outro codigo)
  function corrigirDados() {
    limpar();
    setErroGeral(null);
    setCodigo("");
    setEtapa("dados");
  }

  if (etapa === "codigo" && envio) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-brand">
            <p>Confirme seu e-mail</p>
          </div>

          <form onSubmit={confirmarCodigo} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
            <p className="form-hint">
              Enviamos um código de 6 dígitos para <strong>{envio.emailInstitucional}</strong>. Digite abaixo para confirmar seu
              e-mail. O código vale por 15 minutos. Não chegou? Veja a caixa de spam ou lixo eletrônico.
            </p>
            <p className="form-hint">
              <strong>Se você sair desta página, o cadastro não é concluído e será preciso preenchê-lo de novo.</strong>
            </p>
            {envio.codigoDemo && <p className="form-hint">Modo demonstração — código: {envio.codigoDemo}</p>}

            <div className="campo-codigo">
              <Campo nome="codigo" rotulo="Código de verificação" obrigatorio erro={erros.codigo}>
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                />
              </Campo>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
              {carregando ? "Confirmando…" : "Confirmar e criar conta"}
            </button>

            <div className="cadastro-acoes-codigo">
              <button type="button" className="btn btn-ghost" onClick={() => void reenviarCodigo()} disabled={segundosReenvio > 0 || reenviando}>
                {reenviando ? "Reenviando…" : segundosReenvio > 0 ? `Reenviar código (${segundosReenvio}s)` : "Reenviar código"}
              </button>
              <button type="button" className="btn-link" onClick={corrigirDados}>
                Corrigir meus dados
              </button>
            </div>
          </form>

          <div className="login-links cadastro-login-link">
            <Link to="/login">Já tenho conta — entrar</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Criar conta de usuário</p>
        </div>

        <form onSubmit={enviarDados} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
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

          <Campo
            nome="emailInstitucional"
            rotulo="E-mail institucional"
            obrigatorio
            erro={erros.emailInstitucional}
            dica="Vamos enviar um código para este e-mail. Ele não poderá ser alterado depois."
          >
            <input
              type="email"
              value={form.emailInstitucional}
              onChange={(e) => setForm({ ...form, emailInstitucional: e.target.value })}
              placeholder={`rgm${DOMINIO_INSTITUCIONAL}`}
              autoComplete="email"
            />
          </Campo>

          <Campo nome="senha" rotulo="Senha" obrigatorio erro={erros.senha}>
            <PasswordInput value={form.senha} onChange={(senha) => setForm({ ...form, senha })} autoComplete="new-password" />
          </Campo>
          <RequisitosSenha senha={form.senha} />

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
            {carregando ? "Enviando código…" : "Criar conta"}
          </button>
        </form>

        <div className="login-links cadastro-login-link">
          <Link to="/login">Já tenho conta — entrar</Link>
        </div>
      </div>
    </div>
  );
}
