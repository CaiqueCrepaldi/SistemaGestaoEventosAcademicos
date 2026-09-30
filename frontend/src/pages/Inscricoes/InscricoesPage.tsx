import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, eventoService, inscricaoService, participanteService, salaService } from "../../services";
import type { Evento, Inscricao, Participante, Sala, StatusPresenca } from "../../types";

// traduz o status em cor pra Badge
function badgeTone(status: StatusPresenca): "green" | "red" | "orange" {
  if (status === "PRESENTE") return "green";
  if (status === "AUSENTE") return "red";
  return "orange";
}

// traduz o status em texto pra Badge
function badgeLabel(status: StatusPresenca): string {
  if (status === "PRESENTE") return "Presente";
  if (status === "AUSENTE") return "Ausente";
  return "Pendente";
}

// crud de inscricoes, com busca de aluno por nome/email/rgm no modal
export function InscricoesPage() {
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [buscaParticipante, setBuscaParticipante] = useState("");
  const [participanteSelecionado, setParticipanteSelecionado] = useState<Participante | null>(null);
  const [eventoId, setEventoId] = useState("");
  const [excluindo, setExcluindo] = useState<Inscricao | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca inscricoes/participantes/eventos/salas de uma vez
  async function carregar() {
    const [i, p, e, sa] = await Promise.all([
      inscricaoService.list(),
      participanteService.list(),
      eventoService.list(),
      salaService.list(),
    ]);
    setInscricoes(i);
    setParticipantes(p);
    setEventos(e);
    setSalas(sa);
  }

  // abre o modal de nova inscricao sem evento escolhido (a pessoa escolhe de proposito)
  function abrirNova() {
    setBuscaParticipante("");
    setParticipanteSelecionado(null);
    setEventoId("");
    limpar();
    setModalAberto(true);
  }

  // capacidade da sala menos quantas inscricoes o evento ja tem
  function vagasDisponiveis(evento: Evento | undefined): number | null {
    if (!evento) return null;
    const sala = salas.find((s) => s.id === evento.salaId);
    if (!sala) return null;
    const ocupadas = inscricoes.filter((i) => i.eventoId === evento.id).length;
    return sala.capacidade - ocupadas;
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!participanteSelecionado) faltando.participanteId = "Busque e selecione o aluno.";
    else if (participanteSelecionado.ativo === false) faltando.participanteId = "Aluno inativo: não é possível inscrevê-lo em eventos.";
    if (!eventoId) faltando.eventoId = "Selecione o evento.";
    if (participanteSelecionado && eventoId) {
      if (inscricoes.some((i) => i.participanteId === participanteSelecionado.id && i.eventoId === eventoId)) {
        faltando.eventoId = "Este aluno já está inscrito neste evento.";
      } else {
        const vagas = vagasDisponiveis(eventos.find((e) => e.id === eventoId));
        if (vagas !== null && vagas <= 0) faltando.eventoId = "Não há vagas disponíveis para este evento.";
      }
    }
    return faltando;
  }

  // valida selecao/vaga/duplicidade e cria a inscricao
  async function salvar() {
    if (mostrar(validar())) return;
    try {
      await inscricaoService.create({
        participanteId: participanteSelecionado!.id,
        eventoId,
        statusPresenca: "PENDENTE",
        dataCheckin: null,
        usuarioId: null,
      });
      toast.success("Inscrição registrada.");
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "PARTICIPANTE_INATIVO") mostrar({ participanteId: erro.message });
      else if (erro instanceof ApiError && (erro.code === "JA_INSCRITO" || erro.code === "EVENTO_LOTADO")) mostrar({ eventoId: erro.message });
      else if (!mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar a inscrição.");
    }
  }

  // remove a inscricao marcada pra exclusao
  async function excluir() {
    if (!excluindo) return;
    await inscricaoService.remove(excluindo.id);
    toast.success("Inscrição removida.");
    setExcluindo(null);
    await carregar();
  }

  const eventoSelecionado = eventos.find((e) => e.id === eventoId);
  const vagas = vagasDisponiveis(eventoSelecionado);

  // busca por nome/email/rgm, mesma logica do filtro da tela de check-in
  const alvoBusca = buscaParticipante.trim().toLowerCase();
  const resultadosBusca = alvoBusca
    ? participantes.filter(
        (p) =>
          p.nome.toLowerCase().includes(alvoBusca) ||
          p.email.toLowerCase().includes(alvoBusca) ||
          p.rgm.toLowerCase().includes(alvoBusca),
      )
    : [];

  return (
    <div>
      <PageHeader
        title="Inscrições"
        actions={
          <button
            className="btn btn-primary"
            onClick={abrirNova}
            disabled={participantes.length === 0 || eventos.length === 0}
          >
            + Nova inscrição
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Evento</th>
              <th>Status</th>
              <th>Check-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inscricoes.map((inscricao) => {
              const participante = participantes.find((p) => p.id === inscricao.participanteId);
              const evento = eventos.find((e) => e.id === inscricao.eventoId);
              return (
                <tr key={inscricao.id}>
                  <td>
                    {participante?.nome ?? "—"} {participante?.ativo === false && <Badge tone="red">Inativo</Badge>}
                  </td>
                  <td>{evento?.titulo ?? "—"}</td>
                  <td>
                    <Badge tone={badgeTone(inscricao.statusPresenca)}>{badgeLabel(inscricao.statusPresenca)}</Badge>
                  </td>
                  <td>{inscricao.dataCheckin ? new Date(inscricao.dataCheckin).toLocaleString("pt-BR") : "—"}</td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(inscricao)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
            {inscricoes.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Nenhuma inscrição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title="Nova inscrição" onClose={() => setModalAberto(false)}>
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
            <Campo
              nome="participanteId"
              rotulo="Aluno (busque por nome, e-mail ou RGM)"
              obrigatorio
              erro={erros.participanteId}
            >
              <input
                className="search-input"
                style={{ marginBottom: 0 }}
                value={participanteSelecionado ? `${participanteSelecionado.nome} — ${participanteSelecionado.rgm}` : buscaParticipante}
                onChange={(e) => {
                  setParticipanteSelecionado(null);
                  setBuscaParticipante(e.target.value);
                }}
                placeholder="Nome, e-mail ou RGM…"
                autoComplete="off"
                autoFocus
              />
            </Campo>
            {!participanteSelecionado && resultadosBusca.length > 0 && (
              <ul className="simple-list">
                {resultadosBusca.map((p) => (
                  <li
                    key={p.id}
                    className="simple-list-item clickable"
                    onClick={() => {
                      setParticipanteSelecionado(p);
                      setBuscaParticipante("");
                      limpar("participanteId");
                    }}
                  >
                    <div className="simple-list-item-row">
                      <div className="simple-list-title">{p.nome}</div>
                      {p.ativo === false && <Badge tone="red">Inativo</Badge>}
                    </div>
                    <div className="simple-list-sub">
                      {p.email} · RGM {p.rgm}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!participanteSelecionado && alvoBusca && resultadosBusca.length === 0 && (
              <p className="form-hint">Nenhum participante encontrado.</p>
            )}
            <Campo
              nome="eventoId"
              rotulo="Evento"
              obrigatorio
              erro={erros.eventoId}
              dica={vagas !== null ? (vagas > 0 ? `${vagas} vaga(s) disponível(is) neste evento.` : "Evento sem vagas disponíveis.") : undefined}
            >
              <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
                <option value="">Selecione…</option>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Inscrever
              </button>
            </div>
          </form>
        </Modal>
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover inscrição"
          message="Tem certeza que deseja remover esta inscrição? Essa ação não pode ser desfeita."
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
