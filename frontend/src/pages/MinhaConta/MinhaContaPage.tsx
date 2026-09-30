import { useEffect, useState, type FormEvent } from "react";
import { ConfiguracaoMfa } from "../../components/mfa/ConfiguracaoMfa";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { authService, type UsuarioPerfil } from "../../services/authService";

// seguranca da conta: o 2FA e opcional pra qualquer perfil — cada um ativa ou desativa o proprio aqui
export function MinhaContaPage() {
  const { definirSessao } = useAuth();
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [desativando, setDesativando] = useState(false);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca fresco no servidor (a sessao salva pode ser de antes de uma mudanca)
  async function carregar() {
    setPerfil(await authService.obterMe());
  }

  function fecharDesativar() {
    setDesativando(false);
    setSenha("");
    setCodigo("");
    limpar();
  }

  async function desativar(e: FormEvent) {
    e.preventDefault();
    const faltando: ErrosFormulario = {};
    if (!senha) faltando.senha = "Informe sua senha.";
    if (codigo.length !== 6) faltando.codigo = "Digite os 6 dígitos do aplicativo autenticador.";
    if (mostrar(faltando)) return;

    setEnviando(true);
    try {
      // o servidor encerra as outras sessoes e devolve uma nova pra esta aba
      definirSessao(await authService.desativarMfa(senha, codigo));
      toast.success("Autenticação em dois fatores desativada. As outras sessões da sua conta foram encerradas.");
      fecharDesativar();
      await carregar();
    } catch (erro) {
      if (!mostrarErroDaApi(erro)) {
        mostrar({ codigo: erro instanceof Error ? erro.message : "Não foi possível desativar." });
      }
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  }

  if (!perfil) return <PageHeader title="Minha conta" />;

  return (
    <div>
      <PageHeader title="Minha conta" />

      <div className="card mfa-conta">
        <div className="mfa-conta-cabecalho">
          <h2 className="mfa-titulo">Autenticação em dois fatores</h2>
          <Badge tone={perfil.mfaAtivo ? "green" : "neutral"}>{perfil.mfaAtivo ? "Ativa" : "Inativa"}</Badge>
        </div>

        <p className="form-hint mfa-texto">
          Opcional. Com ela ativa, além da senha o login pede um código de 6 dígitos gerado por um aplicativo
          autenticador instalado no seu celular. O código é gerado no próprio aparelho: não depende de SMS nem de
          e-mail, e nenhum dado seu é enviado a terceiros por causa disso.
        </p>

        {!perfil.mfaAtivo && !configurando && (
          <button className="btn btn-primary" onClick={() => setConfigurando(true)}>
            Ativar
          </button>
        )}

        {perfil.mfaAtivo && (
          <button className="btn btn-ghost btn-danger" onClick={() => setDesativando(true)}>
            Desativar
          </button>
        )}

        {configurando && (
          <div className="mfa-conta-configuracao">
            <ConfiguracaoMfa
              onConcluir={() => {
                setConfigurando(false);
                toast.success("Autenticação em dois fatores ativada.");
                void carregar();
              }}
              onCancelar={() => setConfigurando(false)}
            />
          </div>
        )}
      </div>

      {desativando && (
        <Modal title="Desativar autenticação em dois fatores" onClose={fecharDesativar}>
          <form className="form" onSubmit={desativar} onChange={limparAoEditar} ref={formRef} noValidate>
            <p className="form-hint mfa-texto">
              Confirme com sua senha e o código atual do aplicativo. As outras sessões abertas da sua conta serão
              encerradas e seus códigos de recuperação deixam de valer.
            </p>
            <LegendaObrigatorio />
            <Campo nome="senha" rotulo="Senha" obrigatorio erro={erros.senha}>
              <PasswordInput value={senha} onChange={setSenha} autoComplete="current-password" autoFocus />
            </Campo>
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
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={fecharDesativar}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger-solid" disabled={enviando}>
                {enviando ? "Desativando…" : "Desativar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
