import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, professorService, type EnvioCodigoProfessor, type Professor } from "../../services";
import { validarEmail, validarNome } from "../../utils/validacao";

const DOMINIO_PROFESSOR = "@umc.br";
const VAZIO = { nomeCompleto: "", email: "" };

// avisa como foi o envio do codigo; fora de producao mostra o codigo de demonstracao (como no cadastro)
function avisarEnvio(envio: EnvioCodigoProfessor, inicio: string) {
  const demo = envio.codigoDemo ? ` Modo demonstração — código: ${envio.codigoDemo}` : "";
  if (envio.emailEnviado) toast.success(`${inicio} O código de primeiro acesso foi enviado por e-mail.${demo}`);
  else toast.error(`${inicio} O e-mail com o código não saiu: use "Reenviar código" daqui a pouco.${demo}`);
}

// contas de professor (so administrador e secretaria). Pede so nome e e-mail @umc.br (LGPD: nada alem disso).
// A conta nasce sem senha e sem aceite dos Termos: o professor ativa pela tela "Primeiro acesso" com o
// codigo enviado por e-mail
export function ProfessoresPage() {
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [reenviando, setReenviando] = useState<Professor | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    try {
      setProfessores(await professorService.listar());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os professores.");
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo() {
    setForm(VAZIO);
    limpar();
    setModalAberto(true);
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.nomeCompleto.trim()) faltando.nomeCompleto = "Informe o nome completo.";
    else if (!validarNome(form.nomeCompleto)) faltando.nomeCompleto = "O nome deve conter apenas letras.";
    if (!form.email.trim()) faltando.email = "Informe o e-mail institucional.";
    else if (!validarEmail(form.email) || !form.email.trim().toLowerCase().endsWith(DOMINIO_PROFESSOR)) {
      faltando.email = `Use o e-mail institucional do professor (termina com ${DOMINIO_PROFESSOR}).`;
    }
    return faltando;
  }

  async function salvar() {
    if (mostrar(validar())) return;
    setSalvando(true);
    try {
      const resultado = await professorService.criar({ nomeCompleto: form.nomeCompleto.trim(), email: form.email.trim() });
      avisarEnvio(resultado, "Conta criada.");
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "EMAIL_DUPLICADO") mostrar({ email: erro.message });
      else if (!mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível criar a conta.");
    } finally {
      setSalvando(false);
    }
  }

  async function reenviar() {
    if (!reenviando) return;
    try {
      avisarEnvio(await professorService.reenviarCodigo(reenviando.id), "Novo código gerado; o anterior não vale mais.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar o código.");
    } finally {
      setReenviando(null);
    }
  }

  return (
    <div>
      <PageHeader title="Professores" actions={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo professor</button>} />
      <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
        O professor cria e organiza os próprios eventos, que só aparecem para os alunos depois da aprovação da equipe.
      </p>

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {professores.map((professor) => (
              <tr key={professor.id}>
                <td>{professor.nome}</td>
                <td>{professor.email}</td>
                <td>
                  {professor.situacao === "ATIVO" ? (
                    <Badge tone="green">Ativo</Badge>
                  ) : (
                    <Badge tone="orange">Aguardando primeiro acesso</Badge>
                  )}
                </td>
                <td className="table-actions">
                  {professor.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" && (
                    <button className="btn btn-ghost" onClick={() => setReenviando(professor)}>
                      Reenviar código
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {professores.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  {carregando ? "Carregando…" : "Nenhum professor cadastrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title="Novo professor" onClose={() => setModalAberto(false)}>
          <form
            className="form"
            ref={formRef}
            noValidate
            onChange={limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <LegendaObrigatorio />
            <p className="form-hint">
              Só o nome e o e-mail institucional. O professor recebe por e-mail um código para o primeiro acesso, em que
              define a senha e aceita os Termos de Uso.
            </p>
            <Campo nome="nomeCompleto" rotulo="Nome completo" obrigatorio erro={erros.nomeCompleto}>
              <input value={form.nomeCompleto} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} autoFocus />
            </Campo>
            <Campo nome="email" rotulo="E-mail institucional" obrigatorio erro={erros.email} dica={`Termina com ${DOMINIO_PROFESSOR}.`}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={`nome${DOMINIO_PROFESSOR}`} />
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? "Criando…" : "Criar conta"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {reenviando && (
        <ConfirmDialog
          title="Reenviar código"
          message={`Enviar um novo código de primeiro acesso para ${reenviando.email}? O código anterior deixa de valer.`}
          confirmLabel="Reenviar"
          onConfirm={() => void reenviar()}
          onCancel={() => setReenviando(null)}
        />
      )}
    </div>
  );
}
