import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { toast } from "../../components/ui/Toast";
import { eventoService, feedbackService, participanteService } from "../../services";
import type { EventoParaAvaliar } from "../../services";
import type { Evento, Feedback, Participante } from "../../types";

const SEM_EVENTO_PARA_AVALIAR = "Você poderá avaliar uma palestra depois de receber o certificado dela.";

// lista de avaliacoes por evento, com media e formulario de novo feedback.
// aluno so avalia palestra em que ja recebeu o certificado — a regra eh do backend
// (GET /feedbacks/elegiveis e o 403 no POST); a tela so reflete o que a API liberou
export function FeedbackPage() {
  const { usuario } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  // so equipe (a rota de participantes nao eh liberada pro aluno)
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  // so aluno: palestras que ele pode avaliar agora
  const [paraAvaliar, setParaAvaliar] = useState<EventoParaAvaliar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [eventoId, setEventoId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedbackExcluindo, setFeedbackExcluindo] = useState<Feedback | null>(null);
  const [form, setForm] = useState({ eventoId: "", participanteId: "", nota: 5, comentario: "" });

  const isEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";

  useEffect(() => {
    void carregar();
  }, [usuario?.perfil, usuario?.participanteId]);

  // busca o que cada perfil pode ver: equipe carrega participantes, aluno carrega os eventos avaliaveis
  async function carregar() {
    setCarregando(true);
    setErroCarga(null);
    try {
      if (isEquipe) {
        const [f, e, p] = await Promise.all([feedbackService.list(), eventoService.list(), participanteService.list()]);
        setFeedbacks(f);
        setEventos(e);
        setParticipantes(p);
        setEventoId((atual) => atual || e[0]?.id || "");
      } else {
        const [f, e, avaliaveis] = await Promise.all([
          feedbackService.list(),
          eventoService.list(),
          feedbackService.eventosParaAvaliar(),
        ]);
        setFeedbacks(f);
        setEventos(e);
        setParaAvaliar(avaliaveis);
      }
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar os feedbacks.");
    } finally {
      setCarregando(false);
    }
  }

  // abre o modal em branco: aluno escolhe entre as palestras liberadas, equipe entre evento x participante sem feedback
  function abrirNovo() {
    if (!isEquipe) {
      if (paraAvaliar.length === 0) return;
      setForm({ eventoId: paraAvaliar[0].id, participanteId: "", nota: 5, comentario: "" });
      setModalAberto(true);
      return;
    }

    const combinacaoDisponivel = eventos
      .flatMap((evento) => participantes.map((participante) => ({ evento, participante })))
      .find(
        ({ evento, participante }) =>
          !feedbacks.some((feedback) => feedback.eventoId === evento.id && feedback.participanteId === participante.id),
      );

    if (!combinacaoDisponivel) {
      toast.info("Não há uma palestra disponível para receber um novo feedback.");
      return;
    }

    setForm({
      eventoId: combinacaoDisponivel.evento.id,
      participanteId: combinacaoDisponivel.participante.id,
      nota: 5,
      comentario: "",
    });
    setModalAberto(true);
  }

  // valida o comentario e grava o feedback (403/409 do backend voltam como mensagem)
  async function salvar() {
    if (!form.comentario.trim()) {
      toast.error("Preencha o comentário — todos os campos são obrigatórios.");
      return;
    }

    setSalvando(true);
    try {
      if (isEquipe) {
        await feedbackService.create(form);
      } else {
        await feedbackService.avaliar({ eventoId: form.eventoId, nota: form.nota, comentario: form.comentario });
      }
      toast.success("Feedback registrado.");
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar o feedback.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!feedbackExcluindo) return;

    try {
      await feedbackService.remove(feedbackExcluindo.id);
      toast.success("Feedback removido.");
      setFeedbackExcluindo(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover o feedback.");
    }
  }

  // aluno: o filtro lista so os eventos em que ele ja avaliou; equipe: todos
  const opcoesFiltro = isEquipe ? eventos : eventos.filter((e) => feedbacks.some((f) => f.eventoId === e.id));
  const filtrados = feedbacks.filter((f) => !eventoId || f.eventoId === eventoId);
  const media = filtrados.length > 0 ? filtrados.reduce((acc, f) => acc + f.nota, 0) / filtrados.length : null;

  const opcoesModal: { id: string; titulo: string }[] = isEquipe ? eventos : paraAvaliar;
  const podeCriar = isEquipe ? eventos.length > 0 && participantes.length > 0 : paraAvaliar.length > 0;

  return (
    <div>
      <PageHeader
        title="Feedback"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={carregando || !podeCriar}>
            + Novo feedback
          </button>
        }
      />

      {erroCarga && (
        <div className="card" role="alert">
          <p className="form-error" style={{ marginBottom: 10 }}>
            {erroCarga}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!erroCarga && !isEquipe && !carregando && paraAvaliar.length === 0 && (
        <div className="card">
          <p className="form-hint">
            {feedbacks.length > 0 ? "Você já avaliou todas as palestras liberadas. " : ""}
            {SEM_EVENTO_PARA_AVALIAR}
          </p>
        </div>
      )}

      {!erroCarga && (
        <>
          <div className="card">
            <select className="search-input" value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
              <option value="">Todos os eventos</option>
              {opcoesFiltro.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                </option>
              ))}
            </select>
          </div>

          <div className="stat-grid">
            <StatCard label={isEquipe ? "Avaliações recebidas" : "Minhas avaliações"} value={String(filtrados.length)} tone="blue" />
            <StatCard label={isEquipe ? "Nota média" : "Minha nota média"} value={media !== null ? media.toFixed(1) : "—"} tone="green" />
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  {isEquipe && <th>Participante</th>}
                  <th>Evento</th>
                  <th>Nota</th>
                  <th>Comentário</th>
                  {isEquipe && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={isEquipe ? 5 : 3} className="empty-cell">
                      Carregando…
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtrados.map((f) => (
                      <tr key={f.id}>
                        {isEquipe && <td>{participantes.find((p) => p.id === f.participanteId)?.nome ?? "—"}</td>}
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
                        <td colSpan={isEquipe ? 5 : 3} className="empty-cell">
                          Nenhum feedback registrado.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                {opcoesModal.map((e) => (
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
                  {participantes.map((p) => (
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
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
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
