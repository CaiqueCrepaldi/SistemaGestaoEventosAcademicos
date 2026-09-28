import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../services/api";
import { authService, type ConfiguracaoMfa as DadosConfiguracao, type SessaoUsuario } from "../../services/authService";
import { toast } from "../ui/Toast";

interface ConfiguracaoMfaProps {
  // presente = configuracao obrigatoria da equipe no meio do login; ausente = aluno ja logado ativando
  tokenEtapa?: string;
  obrigatoria?: boolean;
  // chamado depois que a pessoa confirma que guardou os codigos de recuperacao
  onConcluir: (sessao?: SessaoUsuario) => void;
  onCancelar?: () => void;
  onExpirar?: () => void;
}

// segredo em grupos de 4 pra facilitar a digitacao manual no aplicativo
function formatarSegredo(segredo: string): string {
  return segredo.match(/.{1,4}/g)?.join(" ") ?? segredo;
}

// QR code + confirmacao com um codigo + tela final com os codigos de recuperacao (mostrados uma vez so)
export function ConfiguracaoMfa({ tokenEtapa, obrigatoria, onConcluir, onCancelar, onExpirar }: ConfiguracaoMfaProps) {
  const [dados, setDados] = useState<DadosConfiguracao | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [sessao, setSessao] = useState<SessaoUsuario | undefined>(undefined);
  const [guardou, setGuardou] = useState(false);
  // ref pra nao refazer a chamada do QR code so porque o pai recriou a funcao
  const onExpirarRef = useRef(onExpirar);
  useEffect(() => {
    onExpirarRef.current = onExpirar;
  }, [onExpirar]);

  // o servidor devolve o mesmo segredo enquanto a configuracao nao for confirmada, entao a chamada
  // repetida do StrictMode (ou uma aba recarregada) nao troca o QR code
  useEffect(() => {
    let ativo = true;
    authService
      .iniciarConfiguracaoMfa(tokenEtapa)
      .then((res) => {
        if (ativo) setDados(res);
      })
      .catch((e: unknown) => {
        if (!ativo) return;
        if (e instanceof ApiError && e.status === 401 && tokenEtapa && onExpirarRef.current) onExpirarRef.current();
        else setErro(e instanceof Error ? e.message : "Não foi possível gerar o QR code.");
      });
    return () => {
      ativo = false;
    };
  }, [tokenEtapa]);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (codigo.length !== 6) {
      setErro("Digite os 6 dígitos que aparecem no aplicativo.");
      return;
    }
    setEnviando(true);
    try {
      const resultado = await authService.confirmarConfiguracaoMfa(codigo, tokenEtapa);
      setCodigos(resultado.codigosRecuperacao);
      setSessao(resultado.sessao);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && tokenEtapa && onExpirar) {
        onExpirar();
        return;
      }
      setErro(e instanceof Error ? e.message : "Não foi possível confirmar o código.");
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

        <button type="button" className="btn btn-primary btn-block" disabled={!guardou} onClick={() => onConcluir(sessao)}>
          Continuar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirmar} className="form">
      <div>
        <h2 className="mfa-titulo">Configurar autenticação em dois fatores</h2>
        {obrigatoria && (
          <p className="mfa-aviso">
            Obrigatória para administrador e secretaria. Você só acessa o sistema depois de concluir.
          </p>
        )}
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
          <label className="field">
            <span>Código do aplicativo</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="mfa-codigo-input"
            />
          </label>
        </>
      ) : (
        !erro && <p className="form-hint mfa-texto">Gerando QR code…</p>
      )}

      {erro && <p className="form-error">{erro}</p>}

      <button className="btn btn-primary btn-block" type="submit" disabled={!dados || enviando}>
        {enviando ? "Confirmando…" : "Confirmar e ativar"}
      </button>
      {onCancelar && (
        <div className="mfa-acoes-secundarias">
          <button type="button" className="btn-link" onClick={onCancelar}>
            {obrigatoria ? "Voltar" : "Cancelar"}
          </button>
        </div>
      )}
    </form>
  );
}
