import { useState, type FormEvent } from "react";
import { ApiError } from "../../services/api";
import { authService, type SessaoUsuario } from "../../services/authService";
import { useErrosFormulario } from "../../hooks/useErrosFormulario";
import { Campo } from "../ui/Campo";

interface VerificacaoMfaProps {
  tokenEtapa: string;
  onConcluir: (sessao: SessaoUsuario, codigosRecuperacaoRestantes?: number) => void;
  // token da etapa venceu (5 min): volta pro e-mail/senha
  onExpirar: () => void;
  onVoltar: () => void;
}

// segunda etapa do login: codigo de 6 digitos do aplicativo, ou um codigo de recuperacao
export function VerificacaoMfa({ tokenEtapa, onConcluir, onExpirar, onVoltar }: VerificacaoMfaProps) {
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [codigoRecuperacao, setCodigoRecuperacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usarRecuperacao && mostrar(codigo.length === 6 ? {} : { codigo: "Digite os 6 dígitos do aplicativo autenticador." })) return;
    if (usarRecuperacao && mostrar(codigoRecuperacao.trim() ? {} : { codigoRecuperacao: "Digite um dos seus códigos de recuperação." })) return;

    setEnviando(true);
    try {
      const { sessao, codigosRecuperacaoRestantes } = await authService.verificarMfa(
        tokenEtapa,
        usarRecuperacao ? { codigoRecuperacao: codigoRecuperacao.trim() } : { codigo },
      );
      onConcluir(sessao, codigosRecuperacaoRestantes);
    } catch (erro) {
      if (erro instanceof ApiError && erro.status === 401) {
        onExpirar();
        return;
      }
      if (!mostrarErroDaApi(erro)) {
        // codigo errado/ja usado/bloqueio: a mensagem vai embaixo do campo que a pessoa esta usando
        mostrar({ [usarRecuperacao ? "codigoRecuperacao" : "codigo"]: erro instanceof Error ? erro.message : "Não foi possível verificar o código." });
      }
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  }

  function alternarModo() {
    setUsarRecuperacao(!usarRecuperacao);
    limpar();
  }

  return (
    <form onSubmit={handleSubmit} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
      <div>
        <h2 className="mfa-titulo">Verificação em duas etapas</h2>
        <p className="form-hint mfa-texto">
          {usarRecuperacao
            ? "Digite um dos códigos de recuperação que você guardou ao ativar. Cada código funciona uma única vez."
            : "Abra o aplicativo autenticador no seu celular e digite o código de 6 dígitos do SGEA."}
        </p>
      </div>

      {usarRecuperacao ? (
        <Campo nome="codigoRecuperacao" rotulo="Código de recuperação" obrigatorio erro={erros.codigoRecuperacao}>
          <input
            value={codigoRecuperacao}
            onChange={(e) => setCodigoRecuperacao(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            maxLength={11}
            autoComplete="off"
            autoFocus
            className="mfa-codigo-input"
          />
        </Campo>
      ) : (
        <Campo nome="codigo" rotulo="Código do aplicativo" obrigatorio erro={erros.codigo}>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            className="mfa-codigo-input"
          />
        </Campo>
      )}

      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
        {enviando ? "Verificando…" : "Verificar"}
      </button>

      <div className="mfa-acoes-secundarias">
        <button type="button" className="btn-link" onClick={alternarModo}>
          {usarRecuperacao ? "Usar código do aplicativo" : "Usar código de recuperação"}
        </button>
        <button type="button" className="btn-link" onClick={onVoltar}>
          Voltar
        </button>
      </div>
    </form>
  );
}
