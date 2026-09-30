import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, eventoService, feedbackService, MOTIVOS_EXCLUSAO_FEEDBACK, participanteService } from "../../services";
import type { EventoParaAvaliar, MotivoExclusaoFeedback } from "../../services";
import type { Evento, Feedback, Participante } from "../../types";

const SEM_EVENTO_PARA_AVALIAR = "Você poderá avaliar uma palestra depois de receber o certificado dela.";
const ROTULOS_NOTA: Record<number, string> = { 1: "1 — Ruim", 2: "2 — Regular", 3: "3 — Boa", 4: "4 — Muito boa", 5: "5 — Excelente" };

// feedback e do aluno: so ele envia (de palestra em que recebeu o certificado) e ninguem edita
// depois de enviado. O aluno corrige excluindo o proprio e enviando outro; a equipe nao altera o que
// o aluno escreveu, so exclui — sempre com um motivo. As regras valem no backend; a tela so reflete
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
  const [filtroEventoId, setFiltroEventoId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ eventoId: "", nota: "", comentario: "" });
  const [excluindoMeu, setExcluindoMeu] = useState<Feedback | null>(null);
  const [excluindoPelaEquipe, setExcluindoPelaEquipe] = useState<Feedback | null>(null);
  const [motivo, setMotivo] = useState<MotivoExclusaoFeedback | "">("");
  const novo = useErrosFormulario();
  const exclusao = useErrosFormulario();

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

  // so o aluno abre o formulario: a palestra ele escolhe entre as liberadas pra ele
  function abrirNovo() {
    if (paraAvaliar.length === 0) return;
    setForm({ eventoId: paraAvaliar.length === 1 ? paraAvaliar[0].id : "", nota: "", comentario: "" });
    novo.limpar();
    setModalAberto(true);
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.eventoId) faltando.eventoId = "Selecione a palestra.";
    if (!form.nota) faltando.nota = "Escolha uma nota de 1 a 5.";
    if (!form.comentario.trim()) faltando.comentario = "Escreva um comentário.";
    return faltando;
  }

  // grava o feedback (403/409 do backend voltam como mensagem)
  async function salvar() {
    if (novo.mostrar(validar())) return;

    setSalvando(true);
    try {
      await feedbackService.avaliar({ eventoId: form.eventoId, nota: Number(form.nota), comentario: form.comentario.trim() });
      toast.success("Feedback enviado.");
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      if (erro instanceof ApiError && (erro.code === "FEEDBACK_JA_ENVIADO" || erro.status === 403)) novo.mostrar({ eventoId: erro.message });
      else if (!novo.mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o feedback.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirMeu() {
    if (!excluindoMeu) return;
    try {
      await feedbackService.excluirMeu(excluindoMeu.id);
      toast.success("Feedback excluído. Se quiser, envie um novo para essa palestra.");
      setExcluindoMeu(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir o feedback.");
    }
  }

  function abrirExclusaoPelaEquipe(feedback: Feedback) {
    setExcluindoPelaEquipe(feedback);
    setMotivo("");
    exclusao.limpar();
  }

  async function excluirPelaEquipe() {
    if (!excluindoPelaEquipe) return;
    if (exclusao.mostrar(motivo ? {} : { motivo: "Selecione o motivo da exclusão." })) return;
    try {
      await feedbackService.excluirPelaEquipe(excluindoPelaEquipe.id, motivo as MotivoExclusaoFeedback);
      toast.success("Feedback excluído. O motivo ficou registrado na auditoria.");
      setExcluindoPelaEquipe(null);
      await carregar();
    } catch (erro) {
      if (!exclusao.mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir o feedback.");
    }
  }

  // aluno: o filtro lista so os eventos em que ele ja avaliou; equipe: todos
  const opcoesFiltro = isEquipe ? eventos : eventos.filter((e) => feedbacks.some((f) => f.eventoId === e.id));
  const filtrados = feedbacks.filter((f) => !filtroEventoId || f.eventoId === filtroEventoId);
  const media = filtrados.length > 0 ? filtrados.reduce((acc, f) => acc + f.nota, 0) / filtrados.length : null;
  const colunas = isEquipe ? 5 : 4;

  return (
    <div>
      <PageHeader
        title="Feedback"
        actions={
          !isEquipe && (
            <button className="btn btn-primary" onClick={abrirNovo} disabled={carregando || paraAvaliar.length === 0}>
              + Novo feedback
            </button>
          )
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
            <select className="search-input" value={filtroEventoId} onChange={(e) => setFiltroEventoId(e.target.value)} aria-label="Filtrar por evento">
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={colunas} className="empty-cell">
                      Carregando…
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtrados.map((f) => {
                      const participante = participantes.find((p) => p.id === f.participanteId);
                      return (
                        <tr key={f.id}>
                          {isEquipe && (
                            <td>
                              {participante?.nome ?? "—"} {participante?.ativo === false && <Badge tone="red">Inativo</Badge>}
                            </td>
                          )}
                          <td>{eventos.find((e) => e.id === f.eventoId)?.titulo ?? "—"}</td>
                          <td>{"★".repeat(f.nota)}</td>
                          <td>{f.comentario}</td>
                          <td className="table-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-danger"
                              onClick={() => (isEquipe ? abrirExclusaoPelaEquipe(f) : setExcluindoMeu(f))}
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtrados.length === 0 && (
                      <tr>
                        <td colSpan={colunas} className="empty-cell">
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
            ref={novo.formRef}
            noValidate
            onChange={novo.limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <p className="form-hint" style={{ margin: 0 }}>
              Depois de enviado, o feedback não pode ser editado — só excluído (aí você pode enviar outro).
            </p>
            <LegendaObrigatorio />
            <Campo nome="eventoId" rotulo="Palestra" obrigatorio erro={novo.erros.eventoId}>
              <select value={form.eventoId} onChange={(e) => setForm({ ...form, eventoId: e.target.value })} autoFocus>
                <option value="">Selecione…</option>
                {paraAvaliar.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo nome="nota" rotulo="Nota" obrigatorio erro={novo.erros.nota}>
              <select value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })}>
                <option value="">Selecione…</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {ROTULOS_NOTA[n]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo nome="comentario" rotulo="Comentário" obrigatorio erro={novo.erros.comentario} dica="Até 1000 caracteres.">
              <textarea value={form.comentario} onChange={(e) => setForm({ ...form, comentario: e.target.value })} rows={3} maxLength={1000} />
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {excluindoMeu && (
        <ConfirmDialog
          title="Excluir meu feedback"
          message="Excluir este feedback? Essa ação não pode ser desfeita, mas depois você pode enviar um novo para a mesma palestra."
          confirmLabel="Excluir"
          tone="danger"
          onConfirm={() => void excluirMeu()}
          onCancel={() => setExcluindoMeu(null)}
        />
      )}

      {excluindoPelaEquipe && (
        <Modal title="Excluir feedback de aluno" onClose={() => setExcluindoPelaEquipe(null)}>
          <form
            className="form"
            ref={exclusao.formRef}
            noValidate
            onChange={exclusao.limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              void excluirPelaEquipe();
            }}
          >
            <p style={{ margin: 0 }}>
              A equipe não edita o que o aluno escreveu; pode apenas excluir, informando o motivo. O motivo fica registrado
              na auditoria. Essa ação não pode ser desfeita.
            </p>
            <LegendaObrigatorio />
            <Campo nome="motivo" rotulo="Motivo da exclusão" obrigatorio erro={exclusao.erros.motivo}>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoExclusaoFeedback | "")} autoFocus>
                <option value="">Selecione…</option>
                {Object.entries(MOTIVOS_EXCLUSAO_FEEDBACK).map(([codigo, rotulo]) => (
                  <option key={codigo} value={codigo}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setExcluindoPelaEquipe(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger-solid">
                Excluir
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
