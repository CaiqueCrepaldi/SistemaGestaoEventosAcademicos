import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, professorService, type EnvioConviteProfessor, type EventoEmAberto, type Professor } from "../../services";
import { validarEmail, validarNome } from "../../utils/validacao";

const DOMINIO_PROFESSOR = "@umc.br";
const VAZIO = { nomeCompleto: "", email: "" };

// avisa como foi o envio do convite; fora de producao mostra o link de demonstracao (como o codigo do cadastro)
function avisarEnvio(envio: EnvioConviteProfessor, inicio: string) {
  const demo = envio.linkConviteDemo ? ` Modo demonstração — link: ${envio.linkConviteDemo}` : "";
  if (envio.emailEnviado) toast.success(`${inicio} O convite para criar a senha foi enviado por e-mail.${demo}`);
  else toast.error(`${inicio} O e-mail com o convite não saiu: use "Reenviar convite" daqui a pouco.${demo}`);
}

const ROTULO_SITUACAO_EVENTO = { PENDENTE: "aguardando aprovação", APROVADO: "aprovado", RECUSADO: "recusado" } as const;

// contas de professor (so administrador e secretaria). Pede so nome e e-mail @umc.br (LGPD: nada alem disso).
// A conta nasce sem senha e sem aceite dos Termos: o professor recebe por e-mail um link (convite) para criar a
// senha e aceitar os Termos. Inativar pede o motivo e, se ele tem evento em aberto, para quem transferir
// (outro professor ativo ou a equipe); reativar devolve o acesso
export function ProfessoresPage() {
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [reenviando, setReenviando] = useState<Professor | null>(null);
  // inativacao: o professor, os eventos em aberto dele (null enquanto carrega), motivo e destino
  const [inativando, setInativando] = useState<Professor | null>(null);
  const [eventosEmAberto, setEventosEmAberto] = useState<EventoEmAberto[] | null>(null);
  const [inativacao, setInativacao] = useState({ motivo: "", transferirPara: "" });
  const [errosInativacao, setErrosInativacao] = useState<{ motivo?: string; transferirPara?: string }>({});
  const [confirmandoInativacao, setConfirmandoInativacao] = useState(false);
  const [reativando, setReativando] = useState<Professor | null>(null);
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
      avisarEnvio(await professorService.reenviarConvite(reenviando.id), "Novo convite gerado; o anterior não vale mais.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar o convite.");
    } finally {
      setReenviando(null);
    }
  }

  async function abrirInativacao(professor: Professor) {
    setInativando(professor);
    setEventosEmAberto(null);
    setInativacao({ motivo: "", transferirPara: "" });
    setErrosInativacao({});
    try {
      setEventosEmAberto(await professorService.eventosEmAberto(professor.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os eventos do professor.");
      setInativando(null);
    }
  }

  function pedirInativacao() {
    const faltando: { motivo?: string; transferirPara?: string } = {};
    if (inativacao.motivo.trim().length < 3) faltando.motivo = "Informe o motivo da inativação.";
    if ((eventosEmAberto?.length ?? 0) > 0 && !inativacao.transferirPara) {
      faltando.transferirPara = "Escolha para quem vão os eventos em aberto.";
    }
    setErrosInativacao(faltando);
    if (Object.keys(faltando).length === 0) setConfirmandoInativacao(true);
  }

  async function inativar() {
    if (!inativando) return;
    try {
      const { eventosTransferidos } = await professorService.inativar(inativando.id, {
        motivo: inativacao.motivo.trim(),
        ...(inativacao.transferirPara ? { transferirPara: inativacao.transferirPara } : {}),
      });
      toast.success(
        eventosTransferidos > 0
          ? `Professor inativado. ${eventosTransferidos} evento(s) transferido(s) para ${nomeDoDestino(inativacao.transferirPara)}.`
          : "Professor inativado.",
      );
      setInativando(null);
      await carregar();
    } catch (e) {
      if (e instanceof ApiError && e.errors?.some((item) => item.campo === "transferirPara")) {
        setErrosInativacao({ transferirPara: e.errors.find((item) => item.campo === "transferirPara")!.mensagem });
      } else {
        toast.error(e instanceof Error ? e.message : "Não foi possível inativar o professor.");
      }
    } finally {
      setConfirmandoInativacao(false);
    }
  }

  async function reativar() {
    if (!reativando) return;
    try {
      await professorService.reativar(reativando.id);
      toast.success("Professor reativado. Ele volta a entrar com a senha dele.");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reativar o professor.");
    } finally {
      setReativando(null);
    }
  }

  // destinos possiveis: a equipe ou outro professor ATIVO (que ja fez o primeiro acesso); inativo nao recebe
  const destinos = professores.filter((p) => p.situacao === "ATIVO" && p.id !== inativando?.id);
  const nomeDoDestino = (valor: string) => (valor === "EQUIPE" ? "a equipe" : (professores.find((p) => p.id === valor)?.nome ?? "outro professor"));

  return (
    <div>
      <PageHeader title="Professores" actions={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo professor</button>} />
      <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
        O professor cria e organiza os próprios eventos, que só aparecem para os alunos depois da aprovação da equipe. Ao ser
        cadastrado, ele recebe por e-mail um link para criar a senha e aceitar os Termos de Uso.
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
                  ) : professor.situacao === "INATIVO" ? (
                    <div className="situacao-aprovacao">
                      <Badge tone="red">Inativo</Badge>
                      {professor.motivoInativacao && <p className="form-hint motivo-recusa">Motivo: {professor.motivoInativacao}</p>}
                    </div>
                  ) : (
                    <Badge tone="orange">Aguardando primeiro acesso</Badge>
                  )}
                </td>
                <td className="table-actions">
                  {professor.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" && (
                    <button className="btn btn-ghost" onClick={() => setReenviando(professor)}>
                      Reenviar convite
                    </button>
                  )}
                  {professor.situacao === "INATIVO" ? (
                    <button className="btn btn-ghost" onClick={() => setReativando(professor)}>
                      Reativar
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-danger" onClick={() => void abrirInativacao(professor)}>
                      Inativar
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
              Só o nome e o e-mail institucional. O professor recebe por e-mail um link para criar a senha e aceitar os
              Termos de Uso (o link vale por 24 horas).
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

      {inativando && !confirmandoInativacao && (
        <Modal title={`Inativar ${inativando.nome}`} onClose={() => setInativando(null)}>
          {eventosEmAberto === null ? (
            <p className="form-hint">Carregando os eventos do professor…</p>
          ) : (
            <form
              className="form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                pedirInativacao();
              }}
            >
              <LegendaObrigatorio />
              <p className="form-hint">
                O professor deixa de entrar no sistema e as sessões abertas dele caem. Os palestrantes que ele cadastrou
                continuam como estão. Você pode reativar a conta depois.
              </p>
              <Campo nome="motivo" rotulo="Motivo da inativação" obrigatorio erro={errosInativacao.motivo} dica="Visível só para a equipe.">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={inativacao.motivo}
                  onChange={(e) => {
                    setInativacao({ ...inativacao, motivo: e.target.value });
                    setErrosInativacao({ ...errosInativacao, motivo: undefined });
                  }}
                  autoFocus
                />
              </Campo>
              {eventosEmAberto.length === 0 ? (
                <p className="form-hint">Ele não tem eventos em aberto: nada precisa ser transferido.</p>
              ) : (
                <>
                  <p className="form-hint">
                    {eventosEmAberto.length} evento(s) em aberto (ainda não encerrados, ou encerrados há menos de 24 horas)
                    precisam de um novo responsável, com as propostas de alteração que estiverem abertas. Os encerrados há mais
                    tempo continuam com o nome dele.
                  </p>
                  <ul className="lista-eventos-em-aberto">
                    {eventosEmAberto.map((evento) => (
                      <li key={evento.id}>
                        {evento.titulo} — {new Date(evento.horario).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} (
                        {ROTULO_SITUACAO_EVENTO[evento.situacao]})
                      </li>
                    ))}
                  </ul>
                  <Campo nome="transferirPara" rotulo="Transferir os eventos para" obrigatorio erro={errosInativacao.transferirPara}>
                    <select
                      value={inativacao.transferirPara}
                      onChange={(e) => {
                        setInativacao({ ...inativacao, transferirPara: e.target.value });
                        setErrosInativacao({ ...errosInativacao, transferirPara: undefined });
                      }}
                    >
                      <option value="">Selecione…</option>
                      <option value="EQUIPE">Equipe (administração e secretaria)</option>
                      {destinos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setInativando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger-solid">
                  Inativar
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {inativando && confirmandoInativacao && (
        <ConfirmDialog
          title="Inativar professor"
          message={
            (eventosEmAberto?.length ?? 0) > 0
              ? `Tem certeza que deseja inativar ${inativando.nome}? ${eventosEmAberto!.length} evento(s) em aberto vão para ${nomeDoDestino(inativacao.transferirPara)}.`
              : `Tem certeza que deseja inativar ${inativando.nome}?`
          }
          confirmLabel="Inativar"
          tone="danger"
          onConfirm={() => void inativar()}
          onCancel={() => setConfirmandoInativacao(false)}
        />
      )}

      {reativando && (
        <ConfirmDialog
          title="Reativar professor"
          message={`Reativar a conta de ${reativando.nome}? Ele volta a entrar com a senha dele. Os eventos transferidos não voltam sozinhos.`}
          confirmLabel="Reativar"
          onConfirm={() => void reativar()}
          onCancel={() => setReativando(null)}
        />
      )}

      {reenviando && (
        <ConfirmDialog
          title="Reenviar convite"
          message={`Enviar um novo convite para ${reenviando.email}? O link anterior deixa de valer.`}
          confirmLabel="Reenviar"
          onConfirm={() => void reenviar()}
          onCancel={() => setReenviando(null)}
        />
      )}
    </div>
  );
}
