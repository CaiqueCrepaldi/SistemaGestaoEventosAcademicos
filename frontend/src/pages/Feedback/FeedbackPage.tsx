import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { toast } from "../../components/ui/Toast";
import { eventoService, feedbackService, inscricaoService, participanteService } from "../../services";
import type { Evento, Feedback, Inscricao, Participante } from "../../types";

// lista de avaliacoes por evento, com media e formulario de novo feedback
export function FeedbackPage() {
  const { usuario } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [feedbackExcluindo, setFeedbackExcluindo] = useState<Feedback | null>(null);
  const [form, setForm] = useState({ eventoId: "", participanteId: "", nota: 5, comentario: "" });

  const isEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";

  const eventosDisponiveisParaAluno = eventos.filter((evento) =>
    inscricoes.some(
      (inscricao) =>
        inscricao.participanteId === usuario?.participanteId &&
        inscricao.eventoId === evento.id &&
        inscricao.statusPresenca === "PRESENTE" &&
        Boolean(inscricao.dataCheckin),
    ),
  );

  useEffect(() => {
    void carregar();
  }, [usuario?.perfil, usuario?.participanteId]);

  // busca feedbacks/eventos/participantes de uma vez
  async function carregar() {
    const [f, e, p, i] = await Promise.all([
      feedbackService.list(),
      eventoService.list(),
      participanteService.list(),
      inscricaoService.list(),
    ]);
    setFeedbacks(f);
    setEventos(e);
    setParticipantes(p);
    setInscricoes(i);
    if (isEquipe) {
      setEventoId((atual) => atual || e[0]?.id || "");
      return;
    }

    const eventosDisponiveisAgora = e.filter((evento) =>
      i.some(
        (inscricao) =>
          inscricao.participanteId === usuario?.participanteId &&
          inscricao.eventoId === evento.id &&
          inscricao.statusPresenca === "PRESENTE" &&
          Boolean(inscricao.dataCheckin),
      ),
    );

    const primeiroEventoDisponivel = eventosDisponiveisAgora[0]?.id ?? "";
    setEventoId((atual) => atual || primeiroEventoDisponivel);
  }

  // abre o modal em branco pro evento/participante atuais
  function abrirNovo() {
    const eventoPadrao = isEquipe ? eventoId || eventos[0]?.id || "" : eventosDisponiveisParaAluno[0]?.id || "";
    const participantePadrao = isEquipe ? participantes[0]?.id ?? "" : usuario?.participanteId ?? "";

    setForm({ eventoId: eventoPadrao, participanteId: participantePadrao, nota: 5, comentario: "" });
    setModalAberto(true);
  }

  // valida o comentario e grava o feedback
  async function salvar() {
    if (!isEquipe && !usuario?.participanteId) {
      toast.error("Você precisa estar autenticado como aluno para enviar feedback.");
      return;
    }

    if (!form.comentario.trim()) {
      toast.error("Preencha o comentário — todos os campos são obrigatórios.");
      return;
    }

    const payload = {
      ...form,
      participanteId: isEquipe ? form.participanteId : usuario?.participanteId ?? "",
    };

    if (!isEquipe) {
      const participou = inscricoes.some(
        (inscricao) =>
          inscricao.participanteId === usuario?.participanteId &&
          inscricao.eventoId === form.eventoId &&
          inscricao.statusPresenca === "PRESENTE" &&
          Boolean(inscricao.dataCheckin),
      );

      if (!participou) {
        toast.error("Você só pode enviar feedback para palestras em que realizou o check-in.");
        return;
      }
    }

    await feedbackService.create(payload);
    toast.success("Feedback registrado.");
    setModalAberto(false);
    await carregar();
  }

  async function excluir() {
    if (!feedbackExcluindo) return;

    await feedbackService.remove(feedbackExcluindo.id);
    toast.success("Feedback removido.");
    setFeedbackExcluindo(null);
    await carregar();
  }

  const baseFiltrada = feedbacks.filter((f) => !eventoId || f.eventoId === eventoId);
  const filtrados = isEquipe ? baseFiltrada : baseFiltrada.filter((f) => f.participanteId === usuario?.participanteId);
  const media = filtrados.length > 0 ? filtrados.reduce((acc, f) => acc + f.nota, 0) / filtrados.length : null;

  const opcoesEventos = isEquipe ? eventos : eventosDisponiveisParaAluno;
  const opcoesParticipantes = isEquipe ? participantes : participantes.filter((p) => p.id === usuario?.participanteId);

  return (
    <div>
      <PageHeader
        title="Feedback"
        actions={
          <button
            className="btn btn-primary"
            onClick={abrirNovo}
            disabled={isEquipe ? eventos.length === 0 || participantes.length === 0 : eventosDisponiveisParaAluno.length === 0}
          >
            + Novo feedback
          </button>
        }
      />

      <div className="card">
        <select className="search-input" value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          <option value="">Todos os eventos</option>
          {opcoesEventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo}
            </option>
          ))}
        </select>
      </div>

      <div className="stat-grid">
        <StatCard label="Avaliações recebidas" value={String(filtrados.length)} tone="blue" />
        <StatCard label="Nota média" value={media !== null ? media.toFixed(1) : "—"} tone="green" />
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Evento</th>
              <th>Nota</th>
              <th>Comentário</th>
              {isEquipe && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <tr key={f.id}>
                <td>{participantes.find((p) => p.id === f.participanteId)?.nome ?? "—"}</td>
                <td>{eventos.find((e) => e.id === f.eventoId)?.titulo ?? "—"}</td>
                <td>{"★".repeat(f.nota)}</td>
                <td>{f.comentario}</td>
                {isEquipe && (
                  <td>
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => setFeedbackExcluindo(f)}>
                      Excluir
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={isEquipe ? 5 : 4} className="empty-cell">
                  Nenhum feedback registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title="Novo feedback" onClose={() => setModalAberto(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <label className="field">
              <span>Evento</span>
              <select value={form.eventoId} onChange={(e) => setForm({ ...form, eventoId: e.target.value })} required>
                {opcoesEventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </label>
            {isEquipe && (
              <label className="field">
                <span>Participante</span>
                <select
                  value={form.participanteId}
                  onChange={(e) => setForm({ ...form, participanteId: e.target.value })}
                  required
                >
                  {opcoesParticipantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Nota (1 a 5)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={form.nota}
                onChange={(e) => setForm({ ...form, nota: Number(e.target.value) })}
                required
              />
            </label>
            <label className="field">
              <span>Comentário</span>
              <textarea
                value={form.comentario}
                onChange={(e) => setForm({ ...form, comentario: e.target.value })}
                rows={3}
                required
              />
            </label>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {feedbackExcluindo && (
        <ConfirmDialog
          title="Excluir feedback"
          message="Deseja realmente excluir este feedback? Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setFeedbackExcluindo(null)}
        />
      )}
    </div>
  );
}
