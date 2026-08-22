import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { eventoService, feedbackService, participanteService } from "../../services";
import type { Evento, Feedback, Participante } from "../../types";

export function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ eventoId: "", participanteId: "", nota: 5, comentario: "" });

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [f, e, p] = await Promise.all([feedbackService.list(), eventoService.list(), participanteService.list()]);
    setFeedbacks(f);
    setEventos(e);
    setParticipantes(p);
    setEventoId((atual) => atual || e[0]?.id || "");
  }

  function abrirNovo() {
    setForm({ eventoId: eventoId || eventos[0]?.id || "", participanteId: participantes[0]?.id ?? "", nota: 5, comentario: "" });
    setModalAberto(true);
  }

  async function salvar() {
    await feedbackService.create(form);
    setModalAberto(false);
    await carregar();
  }

  const filtrados = feedbacks.filter((f) => !eventoId || f.eventoId === eventoId);
  const media = filtrados.length > 0 ? filtrados.reduce((acc, f) => acc + f.nota, 0) / filtrados.length : null;

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle="Avaliações dos participantes após os eventos"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={eventos.length === 0 || participantes.length === 0}>
            + Novo feedback
          </button>
        }
      />

      <div className="card">
        <select className="search-input" value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          <option value="">Todos os eventos</option>
          {eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
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
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <tr key={f.id}>
                <td>{participantes.find((p) => p.id === f.participanteId)?.nome ?? "—"}</td>
                <td>{eventos.find((e) => e.id === f.eventoId)?.nome ?? "—"}</td>
                <td>{"★".repeat(f.nota)}</td>
                <td>{f.comentario}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
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
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Participante</span>
              <select
                value={form.participanteId}
                onChange={(e) => setForm({ ...form, participanteId: e.target.value })}
                required
              >
                {participantes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
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
    </div>
  );
}
