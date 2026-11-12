import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import {
  ApiError,
  equipeService,
  type ContaEquipe,
  type EnvioConvite,
  type EventoEmAberto,
  type PerfilEquipe,
} from "../../services";
import { validarEmail, validarNome } from "../../utils/validacao";

const DOMINIO_EQUIPE = "@umc.br";
const VAZIO: { nomeCompleto: string; email: string; perfil: PerfilEquipe } = { nomeCompleto: "", email: "", perfil: "PROFESSOR" };
const ROTULO_PERFIL: Record<PerfilEquipe, string> = { PROFESSOR: "Professor", SECRETARIA: "Secretaria" };

// avisa como foi o envio do convite; fora de producao mostra o link de demonstracao (como o codigo do cadastro)
function avisarEnvio(envio: EnvioConvite, inicio: string) {
  const demo = envio.linkConviteDemo ? ` Modo demonstração — link: ${envio.linkConviteDemo}` : "";
  if (envio.emailEnviado) toast.success(`${inicio} O convite para criar a senha foi enviado por e-mail.${demo}`);
  else toast.error(`${inicio} O e-mail com o convite não saiu: use "Reenviar convite" daqui a pouco.${demo}`);
}

const ROTULO_SITUACAO_EVENTO = { PENDENTE: "aguardando aprovação", APROVADO: "aprovado", RECUSADO: "recusado" } as const;

// tela Equipe (antes "Professores"), so administrador e secretaria: contas de professor e de secretaria. Pede so
// nome, e-mail @umc.br e o perfil (LGPD: nada alem disso); a opcao Secretaria so aparece para o administrador (a API
// tambem recusa). A conta nasce sem senha e sem aceite dos Termos: a pessoa recebe por e-mail um link (convite) para
// criar a senha e aceitar os Termos. Inativar pede o motivo e, se o professor tem evento em aberto, para quem
// transferir; excluir so conta inativa ou com convite pendente, e quem tem historico fica inativo
export function EquipePage() {
  const { usuario } = useAuth();
  const ehAdministrador = usuario?.perfil === "ADMINISTRADOR";
  const [contas, setContas] = useState<ContaEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroPerfil, setFiltroPerfil] = useState<"" | PerfilEquipe>("");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [reenviando, setReenviando] = useState<ContaEquipe | null>(null);
  // inativacao: a conta, os eventos em aberto (null enquanto carrega), motivo e destino
  const [inativando, setInativando] = useState<ContaEquipe | null>(null);
  const [eventosEmAberto, setEventosEmAberto] = useState<EventoEmAberto[] | null>(null);
  const [inativacao, setInativacao] = useState({ motivo: "", transferirPara: "" });
  const [errosInativacao, setErrosInativacao] = useState<{ motivo?: string; transferirPara?: string }>({});
  const [confirmandoInativacao, setConfirmandoInativacao] = useState(false);
  const [reativando, setReativando] = useState<ContaEquipe | null>(null);
  const [excluindo, setExcluindo] = useState<ContaEquipe | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    try {
      setContas(await equipeService.listar());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a equipe.");
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
    else if (!validarEmail(form.email) || !form.email.trim().toLowerCase().endsWith(DOMINIO_EQUIPE)) {
      faltando.email = `Use o e-mail institucional (termina com ${DOMINIO_EQUIPE}).`;
    }
    return faltando;
  }

  async function salvar() {
    if (mostrar(validar())) return;
    setSalvando(true);
    try {
      const resultado = await equipeService.criar({ nomeCompleto: form.nomeCompleto.trim(), email: form.email.trim(), perfil: form.perfil });
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
      avisarEnvio(await equipeService.reenviarConvite(reenviando.id), "Novo convite gerado; o anterior não vale mais.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar o convite.");
    } finally {
      setReenviando(null);
    }
  }

  async function abrirInativacao(conta: ContaEquipe) {
    setInativando(conta);
    setEventosEmAberto(null);
    setInativacao({ motivo: "", transferirPara: "" });
    setErrosInativacao({});
    try {
      setEventosEmAberto(await equipeService.eventosEmAberto(conta.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os eventos da conta.");
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
      const { eventosTransferidos } = await equipeService.inativar(inativando.id, {
        motivo: inativacao.motivo.trim(),
        ...(inativacao.transferirPara ? { transferirPara: inativacao.transferirPara } : {}),
      });
      toast.success(
        eventosTransferidos > 0
          ? `Conta inativada. ${eventosTransferidos} evento(s) transferido(s) para ${nomeDoDestino(inativacao.transferirPara)}.`
          : "Conta inativada.",
      );
      setInativando(null);
      await carregar();
    } catch (e) {
      if (e instanceof ApiError && e.errors?.some((item) => item.campo === "transferirPara")) {
        setErrosInativacao({ transferirPara: e.errors.find((item) => item.campo === "transferirPara")!.mensagem });
      } else {
        toast.error(e instanceof Error ? e.message : "Não foi possível inativar a conta.");
      }
    } finally {
      setConfirmandoInativacao(false);
    }
  }

  async function reativar() {
    if (!reativando) return;
    try {
      await equipeService.reativar(reativando.id);
      toast.success("Conta reativada. A pessoa volta a entrar com a senha dela.");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reativar a conta.");
    } finally {
      setReativando(null);
    }
  }

  async function excluir() {
    if (!excluindo) return;
    try {
      const resultado = await equipeService.excluir(excluindo.id);
      if (resultado.excluida) toast.success("Conta excluída.");
      else toast.success(resultado.mensagem);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a conta.");
    } finally {
      setExcluindo(null);
    }
  }

  // destinos possiveis: a equipe ou outro professor ATIVO (que ja fez o primeiro acesso); inativo nao recebe
  const destinos = contas.filter((c) => c.perfil === "PROFESSOR" && c.situacao === "ATIVO" && c.id !== inativando?.id);
  const nomeDoDestino = (valor: string) => (valor === "EQUIPE" ? "a equipe" : (contas.find((c) => c.id === valor)?.nome ?? "outro professor"));
  const visiveis = filtroPerfil ? contas.filter((c) => c.perfil === filtroPerfil) : contas;
  const ehProfessor = inativando?.perfil === "PROFESSOR";

  return (
    <div>
      <PageHeader title="Equipe" actions={<button className="btn btn-primary" onClick={abrirNovo}>+ Nova conta</button>} />
      <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
        Contas de professor e de secretaria. O professor cria e organiza os próprios eventos, que só aparecem para os alunos
        depois da aprovação da equipe. Ao ser cadastrada, a pessoa recebe por e-mail um link para criar a senha e aceitar os
        Termos de Uso.{ehAdministrador ? "" : " A secretaria gerencia só as contas de professor."}
      </p>

      <div className="card table-scroll">
        <div className="filtros-linha">
          <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value as "" | PerfilEquipe)} aria-label="Filtrar por perfil">
            <option value="">Todos os perfis</option>
            <option value="PROFESSOR">Professores</option>
            <option value="SECRETARIA">Secretarias</option>
          </select>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((conta) => (
              <tr key={conta.id}>
                <td>{conta.nome}</td>
                <td>{conta.email}</td>
                <td>{ROTULO_PERFIL[conta.perfil]}</td>
                <td>
                  {conta.situacao === "ATIVO" ? (
                    <Badge tone="green">Ativo</Badge>
                  ) : conta.situacao === "INATIVO" ? (
                    <div className="situacao-aprovacao">
                      <Badge tone="red">Inativo</Badge>
                      {conta.motivoInativacao && <p className="form-hint motivo-recusa">Motivo: {conta.motivoInativacao}</p>}
                    </div>
                  ) : (
                    <Badge tone="orange">Convite pendente</Badge>
                  )}
                </td>
                <td className="table-actions">
                  {conta.podeGerenciar && (
                    <>
                      {conta.situacao === "AGUARDANDO_PRIMEIRO_ACESSO" && (
                        <button className="btn btn-ghost" onClick={() => setReenviando(conta)}>
                          Reenviar convite
                        </button>
                      )}
                      {conta.situacao === "INATIVO" ? (
                        <button className="btn btn-ghost" onClick={() => setReativando(conta)}>
                          Reativar
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-danger" onClick={() => void abrirInativacao(conta)}>
                          Inativar
                        </button>
                      )}
                      {conta.situacao !== "ATIVO" && (
                        <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(conta)}>
                          Excluir
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  {carregando ? "Carregando…" : "Nenhuma conta encontrada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title="Nova conta da equipe" onClose={() => setModalAberto(false)}>
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
              Só o nome, o e-mail institucional e o perfil. A pessoa recebe por e-mail um link para criar a senha e aceitar
              os Termos de Uso (o link vale por 24 horas).
            </p>
            {ehAdministrador && (
              <Campo nome="perfil" rotulo="Perfil" obrigatorio erro={erros.perfil}>
                <select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as PerfilEquipe })}>
                  <option value="PROFESSOR">Professor</option>
                  <option value="SECRETARIA">Secretaria</option>
                </select>
              </Campo>
            )}
            <Campo nome="nomeCompleto" rotulo="Nome completo" obrigatorio erro={erros.nomeCompleto}>
              <input value={form.nomeCompleto} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} autoFocus />
            </Campo>
            <Campo nome="email" rotulo="E-mail institucional" obrigatorio erro={erros.email} dica={`Termina com ${DOMINIO_EQUIPE}.`}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={`nome${DOMINIO_EQUIPE}`} />
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
            <p className="form-hint">Carregando os eventos da conta…</p>
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
                A pessoa deixa de entrar no sistema e as sessões abertas dela caem.
                {ehProfessor ? " Os palestrantes que ele cadastrou continuam como estão." : ""} Você pode reativar a conta depois.
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
              {!ehProfessor ? null : eventosEmAberto.length === 0 ? (
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
                      {destinos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
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
          title={`Inativar ${ROTULO_PERFIL[inativando.perfil].toLowerCase()}`}
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
          title="Reativar conta"
          message={`Reativar a conta de ${reativando.nome}? A pessoa volta a entrar com a senha dela. Os eventos transferidos não voltam sozinhos.`}
          confirmLabel="Reativar"
          onConfirm={() => void reativar()}
          onCancel={() => setReativando(null)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Excluir conta"
          message={
            excluindo.situacao === "AGUARDANDO_PRIMEIRO_ACESSO"
              ? `Excluir a conta de ${excluindo.nome}? Ela ainda não foi ativada: a conta e o convite pendente são apagados (útil para corrigir um e-mail digitado errado).`
              : `Excluir a conta de ${excluindo.nome}? Se ela tiver histórico no sistema (eventos, palestrantes, aprovações, propostas ou check-ins), fica preservada como inativa. Os registros de auditoria nunca são apagados.`
          }
          confirmLabel="Excluir"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
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
