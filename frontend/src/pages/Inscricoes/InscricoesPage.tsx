import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { eventoService, inscricaoService, participanteService, salaService } from "../../services";
import type { Evento, Inscricao, Participante, Sala, StatusPresenca } from "../../types";

function badgeTone(status: StatusPresenca): "green" | "red" | "orange" {
  if (status === "PRESENTE") return "green";
  if (status === "AUSENTE") return "red";
  return "orange";
}

function badgeLabel(status: StatusPresenca): string {
  if (status === "PRESENTE") return "Presente";
  if (status === "AUSENTE") return "Ausente";
  return "Pendente";
}

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

  useEffect(() => {
    void carregar();
  }, []);

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

  function abrirNova() {
    setBuscaParticipante("");
    setParticipanteSelecionado(null);
    setEventoId(eventos[0]?.id ?? "");
    setModalAberto(true);
  }

  function vagasDisponiveis(evento: Evento | undefined): number | null {
    if (!evento) return null;
    const sala = salas.find((s) => s.id === evento.salaId);
    if (!sala) return null;
    const ocupadas = inscricoes.filter((i) => i.eventoId === evento.id).length;
    return sala.capacidade - ocupadas;
  }

  async function salvar() {
    if (!participanteSelecionado) {
      toast.error("Busque e selecione um aluno por nome, e-mail ou RGM.");
      return;
    }
    if (!eventoId) {
      toast.error("Selecione um evento.");
      return;
    }
    const jaInscrito = inscricoes.some(
      (i) => i.participanteId === participanteSelecionado.id && i.eventoId === eventoId,
    );
    if (jaInscrito) {
      toast.error("Este participante já está inscrito neste evento.");
      return;
    }
    const evento = eventos.find((e) => e.id === eventoId);
    const vagas = vagasDisponiveis(evento);
    if (vagas !== null && vagas <= 0) {
      toast.error("Não há vagas disponíveis para este evento.");
      return;
    }
    await inscricaoService.create({
      participanteId: participanteSelecionado.id,
      eventoId,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
    toast.success("Inscrição registrada.");
    setModalAberto(false);
    await carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    await inscricaoService.remove(excluindo.id);
    toast.success("Inscrição removida.");
    setExcluindo(null);
    await carregar();
  }

  const eventoSelecionado = eventos.find((e) => e.id === eventoId);
  const vagas = vagasDisponiveis(eventoSelecionado);

  // busca por nome/email/rgm, mesma logica do checkinService.buscarParticipantes
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
                  <td>{participante?.nome ?? "—"}</td>
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
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <div className="field">
              <span>Aluno (busque por nome, e-mail ou RGM)</span>
              <input
                className="search-input"
                style={{ marginBottom: 0 }}
                value={participanteSelecionado ? `${participanteSelecionado.nome} — ${participanteSelecionado.rgm}` : buscaParticipante}
                onChange={(e) => {
                  setParticipanteSelecionado(null);
                  setBuscaParticipante(e.target.value);
                }}
                placeholder="Nome, e-mail ou RGM…"
                autoFocus
                required
              />
              {!participanteSelecionado && resultadosBusca.length > 0 && (
                <ul className="simple-list">
                  {resultadosBusca.map((p) => (
                    <li
                      key={p.id}
                      className="simple-list-item clickable"
                      onClick={() => {
                        setParticipanteSelecionado(p);
                        setBuscaParticipante("");
                      }}
                    >
                      <div className="simple-list-title">{p.nome}</div>
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
            </div>
            <label className="field">
              <span>Evento</span>
              <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} required>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </label>
            {vagas !== null && (
              <p className={vagas <= 0 ? "form-error" : "form-hint"}>
                {vagas > 0 ? `${vagas} vaga(s) disponível(is) neste evento.` : "Evento sem vagas disponíveis."}
              </p>
            )}
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
