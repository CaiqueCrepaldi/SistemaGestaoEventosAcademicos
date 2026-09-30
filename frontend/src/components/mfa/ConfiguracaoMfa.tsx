import { useEffect, useState, type FormEvent } from "react";
import { authService, type ConfiguracaoMfa as DadosConfiguracao } from "../../services/authService";
import { useErrosFormulario } from "../../hooks/useErrosFormulario";
import { Campo } from "../ui/Campo";
import { toast } from "../ui/Toast";

interface ConfiguracaoMfaProps {
  // chamado depois que a pessoa confirma que guardou os codigos de recuperacao
  onConcluir: () => void;
  onCancelar: () => void;
}

// segredo em grupos de 4 pra facilitar a digitacao manual no aplicativo
function formatarSegredo(segredo: string): string {
  return segredo.match(/.{1,4}/g)?.join(" ") ?? segredo;
}

// ativacao opcional do 2FA (qualquer perfil): QR code + confirmacao com um codigo + tela final com
// os codigos de recuperacao, mostrados uma vez so
export function ConfiguracaoMfa({ onConcluir, onCancelar }: ConfiguracaoMfaProps) {
  const [dados, setDados] = useState<DadosConfiguracao | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [guardou, setGuardou] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limparAoEditar } = useErrosFormulario();

  // o servidor devolve o mesmo segredo enquanto a configuracao nao for confirmada, entao a chamada
  // repetida do StrictMode (ou uma aba recarregada) nao troca o QR code
  useEffect(() => {
    let ativo = true;
    authService
      .iniciarConfiguracaoMfa()
      .then((res) => {
        if (ativo) setDados(res);
      })
      .catch((e: unknown) => {
        if (ativo) setErroCarga(e instanceof Error ? e.message : "Não foi possível gerar o QR code.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (mostrar(codigo.length === 6 ? {} : { codigo: "Digite os 6 dígitos que aparecem no aplicativo." })) return;

    setEnviando(true);
    try {
      const resultado = await authService.confirmarConfiguracaoMfa(codigo);
      setCodigos(resultado.codigosRecuperacao);
    } catch (erro) {
      if (!mostrarErroDaApi(erro)) {
        mostrar({ codigo: erro instanceof Error ? erro.message : "Não foi possível confirmar o código." });
      }
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    if (!codigos) return;
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      toast.success("Códigos copiados.");
    } catch {
      toast.error("Não foi possível copiar. Use o botão de baixar.");
    }
  }

  function baixar() {
    if (!codigos) return;
    const conteudo = [
      "SGEA — códigos de recuperação da autenticação em dois fatores",
      `Gerados em ${new Date().toLocaleString("pt-BR")}`,
      "Cada código funciona uma única vez, no lugar do código do aplicativo.",
      "",
      ...codigos,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sgea-codigos-de-recuperacao.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (codigos) {
    return (
      <div className="form">
        <div>
          <h2 className="mfa-titulo">Autenticação em dois fatores ativada</h2>
          <p className="form-hint mfa-texto">
            Se perder o celular, use um destes códigos no lugar do código do aplicativo. Cada um funciona uma única vez.
          </p>
        </div>

        <p className="mfa-aviso">
          <strong>Guarde agora.</strong> Estes códigos não serão mostrados de novo.
        </p>

        <ul className="mfa-codigos">
          {codigos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <div className="mfa-botoes">
          <button type="button" className="btn btn-ghost" onClick={() => void copiar()}>
            Copiar
          </button>
          <button type="button" className="btn btn-ghost" onClick={baixar}>
            Baixar .txt
          </button>
        </div>

        <label className="lgpd-consent">
          <input type="checkbox" checked={guardou} onChange={(e) => setGuardou(e.target.checked)} />
          <span>Guardei meus códigos de recuperação em um lugar seguro.</span>
        </label>

        <button type="button" className="btn btn-primary btn-block" disabled={!guardou} onClick={onConcluir}>
          Continuar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirmar} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
      <div>
        <h2 className="mfa-titulo">Configurar autenticação em dois fatores</h2>
      </div>

      <ol className="mfa-passos">
        <li>Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy ou outro).</li>
        <li>No aplicativo, escaneie o QR code abaixo.</li>
        <li>Digite o código de 6 dígitos que aparecer.</li>
      </ol>

      {dados ? (
        <>
          <div className="mfa-qr">
            <img src={dados.qrCode} alt="QR code para configurar o aplicativo autenticador" width={200} height={200} />
          </div>
          <div>
            <p className="form-hint mfa-texto">Não consegue escanear? Digite esta chave no aplicativo:</p>
            <code className="mfa-segredo">{formatarSegredo(dados.segredo)}</code>
          </div>
          <Campo nome="codigo" rotulo="Código do aplicativo" obrigatorio erro={erros.codigo}>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="mfa-codigo-input"
            />
          </Campo>
        </>
      ) : (
        !erroCarga && <p className="form-hint mfa-texto">Gerando QR code…</p>
      )}

      {erroCarga && <p className="form-error">{erroCarga}</p>}

      <button className="btn btn-primary btn-block" type="submit" disabled={!dados || enviando}>
        {enviando ? "Confirmando…" : "Confirmar e ativar"}
      </button>
      <div className="mfa-acoes-secundarias">
        <button type="button" className="btn-link" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
