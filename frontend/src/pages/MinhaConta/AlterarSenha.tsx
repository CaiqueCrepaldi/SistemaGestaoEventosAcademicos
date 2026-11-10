import { useState, type FormEvent } from "react";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RequisitosSenha } from "../../components/ui/RequisitosSenha";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { authService, type SessaoUsuario } from "../../services/authService";
import { MENSAGEM_REGRA_SENHA, validarSenhaNova } from "../../utils/validacao";

interface AlterarSenhaProps {
  mfaAtivo: boolean;
  // sessao reemitida pelo servidor (as outras foram encerradas): quem trocou continua logado
  onSessao: (sessao: SessaoUsuario) => void;
}

// nomes dos campos de codigo nesta tela: o modal "Desativar 2FA" da mesma pagina ja usa "codigo"
const CAMPO_DA_API: Record<string, string> = { codigo: "codigoTroca", codigoRecuperacao: "codigoRecuperacaoTroca" };

// "Alterar senha" da Minha Conta (qualquer perfil). As regras valem na API (senha atual, regra da senha nova,
// nova diferente da atual, confirmacao, 2FA e limite de tentativas); a tela so adianta os avisos
export function AlterarSenha({ mfaAtivo, onSessao }: AlterarSenhaProps) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [codigoRecuperacao, setCodigoRecuperacao] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  function limparCampos() {
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmacaoSenha("");
    setCodigo("");
    setCodigoRecuperacao("");
    setUsarRecuperacao(false);
    limpar();
  }

  // confere o preenchimento e so entao pede a confirmacao
  function pedirConfirmacao(e: FormEvent) {
    e.preventDefault();
    const faltando: ErrosFormulario = {};
    if (!senhaAtual) faltando.senhaAtual = "Informe a senha atual.";
    if (!novaSenha) faltando.novaSenha = "Crie a nova senha.";
    else if (!validarSenhaNova(novaSenha)) faltando.novaSenha = MENSAGEM_REGRA_SENHA;
    else if (novaSenha === senhaAtual) faltando.novaSenha = "A nova senha precisa ser diferente da atual.";
    if (!confirmacaoSenha) faltando.confirmacaoSenha = "Repita a nova senha.";
    else if (novaSenha && confirmacaoSenha !== novaSenha) faltando.confirmacaoSenha = "As senhas não coincidem.";
    if (mfaAtivo && !usarRecuperacao && codigo.length !== 6) faltando.codigoTroca = "Digite os 6 dígitos do aplicativo autenticador.";
    if (mfaAtivo && usarRecuperacao && !codigoRecuperacao.trim()) faltando.codigoRecuperacaoTroca = "Digite um dos seus códigos de recuperação.";
    if (mostrar(faltando)) return;
    setConfirmando(true);
  }

  async function alterar() {
    setConfirmando(false);
    setEnviando(true);
    try {
      const segundoFator = !mfaAtivo ? {} : usarRecuperacao ? { codigoRecuperacao: codigoRecuperacao.trim() } : { codigo };
      onSessao(await authService.alterarSenha({ senhaAtual, novaSenha, confirmacaoSenha, ...segundoFator }));
      limparCampos();
      toast.success("Senha alterada. As outras sessões da sua conta foram encerradas.");
    } catch (erro) {
      if (!mostrarErroDaApi(erro, (campo) => CAMPO_DA_API[campo] ?? campo)) {
        // senha atual ou codigo errados (mensagem generica, nao diz qual) e bloqueio por tentativas
        mostrar({ senhaAtual: erro instanceof Error ? erro.message : "Não foi possível alterar a senha." });
      }
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  }

  function alternarCodigo() {
    setUsarRecuperacao(!usarRecuperacao);
    setCodigo("");
    setCodigoRecuperacao("");
    limpar("codigoTroca");
    limpar("codigoRecuperacaoTroca");
  }

  return (
    <div className="card mfa-conta">
      <h2 className="mfa-titulo">Alterar senha</h2>
      <p className="form-hint mfa-texto">
        Ao trocar a senha, as outras sessões abertas da sua conta são encerradas e você recebe um aviso no seu e-mail.
        Esta sessão continua aberta.
      </p>

      <form className="form alterar-senha-form" onSubmit={pedirConfirmacao} onChange={limparAoEditar} ref={formRef} noValidate>
        <LegendaObrigatorio />
        <Campo nome="senhaAtual" rotulo="Senha atual" obrigatorio erro={erros.senhaAtual}>
          <PasswordInput value={senhaAtual} onChange={setSenhaAtual} autoComplete="current-password" />
        </Campo>

        <Campo nome="novaSenha" rotulo="Nova senha" obrigatorio erro={erros.novaSenha}>
          <PasswordInput value={novaSenha} onChange={setNovaSenha} autoComplete="new-password" />
        </Campo>
        <RequisitosSenha senha={novaSenha} />

        <Campo nome="confirmacaoSenha" rotulo="Confirmar nova senha" obrigatorio erro={erros.confirmacaoSenha}>
          <PasswordInput value={confirmacaoSenha} onChange={setConfirmacaoSenha} autoComplete="new-password" />
        </Campo>

        {mfaAtivo &&
          (usarRecuperacao ? (
            <Campo nome="codigoRecuperacaoTroca" rotulo="Código de recuperação" obrigatorio erro={erros.codigoRecuperacaoTroca}>
              <input
                value={codigoRecuperacao}
                onChange={(e) => setCodigoRecuperacao(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX"
                maxLength={11}
                autoComplete="off"
                className="mfa-codigo-input"
              />
            </Campo>
          ) : (
            <Campo nome="codigoTroca" rotulo="Código do aplicativo autenticador" obrigatorio erro={erros.codigoTroca}>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="mfa-codigo-input"
              />
            </Campo>
          ))}
        {mfaAtivo && (
          <div className="mfa-acoes-secundarias">
            <button type="button" className="btn-link" onClick={alternarCodigo}>
              {usarRecuperacao ? "Usar código do aplicativo" : "Usar código de recuperação"}
            </button>
          </div>
        )}

        <div>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? "Alterando…" : "Alterar senha"}
          </button>
        </div>
      </form>

      {confirmando && (
        <ConfirmDialog
          title="Alterar senha"
          message="Tem certeza que deseja alterar sua senha? As outras sessões abertas serão encerradas."
          confirmLabel="Alterar senha"
          onConfirm={() => void alterar()}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}
