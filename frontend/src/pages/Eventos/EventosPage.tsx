import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  emailService,
  eventoService,
  inscricaoAlunoService,
  inscricaoService,
  palestranteService,
  salaService,
} from "../../services";
import type { Evento, Inscricao, Palestrante, Sala } from "../../types";
import { questionarioVazio, validarQuestionario } from "../../utils/questionario";

function formVazio(salas: Sala[], palestrantes: Palestrante[]): Omit<Evento, "id"> {
  return {
    titulo: "",
    horario: "",
    salaId: salas[0]?.id ?? "",
    palestranteId: palestrantes[0]?.id ?? "",
    tema: "",
    cargaHoraria: 1,
    questionario: questionarioVazio(),
  };
}

export function EventosPage() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [avisoPorEvento, setAvisoPorEvento] = useState<Record<string, string>>({});
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState<Omit<Evento, "id">>(formVazio([], []));
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Evento | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [e, sa, p, i] = await Promise.all([
      eventoService.list(),
      salaService.list(),
      palestranteService.list(),
      inscricaoService.list(),
    ]);
    setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario)));
    setSalas(sa);
    setPalestrantes(p);
    setInscricoes(i);
  }

  async function inscreverSe(evento: Evento) {
    if (!usuario?.participanteId) {
      toast.error("Disponível apenas para contas de aluno.");
      return;
    }

    try {
      const nova = await inscricaoAlunoService.inscrever(usuario.participanteId, evento.id);
      setInscricoes((prev) => [...prev, nova]);

      const { destinatario } = await emailService.enviarConfirmacaoInscricao(nova);
      const mensagem = `Inscrição confirmada. E-mail de confirmação enviado para ${destinatario}.`;
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
      toast.success(mensagem);
    } catch (e) {
      const mensagem = e instanceof ApiError ? e.message : "Não foi possível concluir a inscrição.";
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
      toast.error(mensagem);
    }
  }

  // ALUNO ve lista read-only com botao de inscricao, sem chegar no CRUD abaixo
  if (usuario?.perfil === "ALUNO") {
    return (
      <div>
        <PageHeader title="Eventos" />
        <div className="card">
          <ul className="agenda-list">
            {eventos.map((evento) => {
              const sala = salas.find((s) => s.id === evento.salaId);
              const palestrante = palestrantes.find((p) => p.id === evento.palestranteId);
              const jaInscrito = inscricoes.some(
                (i) => i.participanteId === usuario?.participanteId && i.eventoId === evento.id,
              );
              return (
                <li key={evento.id} className="agenda-item">
                  <div className="agenda-time" style={{ width: 90 }}>
                    {evento.horario ? (
                      <>
                        <div>{new Date(evento.horario).toLocaleDateString("pt-BR")}</div>
                        <div>
                          {new Date(evento.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="agenda-details" style={{ flex: 1 }}>
                    <div className="simple-list-title">{evento.titulo}</div>
                    <div className="simple-list-sub">Tema: {evento.tema || "—"}</div>
                    <div className="simple-list-sub">Palestrante: {palestrante?.nome ?? "—"}</div>
                    <div className="simple-list-sub">Local: {sala?.nome ?? "—"}</div>
                    {avisoPorEvento[evento.id] && <p className="form-hint">{avisoPorEvento[evento.id]}</p>}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ alignSelf: "center" }}
                    onClick={() => void inscreverSe(evento)}
                    disabled={jaInscrito}
                  >
                    {jaInscrito ? "Inscrito" : "Inscrever-se"}
                  </button>
                </li>
              );
            })}
            {eventos.length === 0 && <p className="empty-cell">Nenhum evento cadastrado.</p>}
          </ul>
        </div>
      </div>
    );
  }

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio(salas, palestrantes));
    setModalAberto(true);
  }

  function abrirEdicao(evento: Evento) {
    setEditando(evento);
    setForm({
      titulo: evento.titulo,
      horario: evento.horario,
      salaId: evento.salaId,
      palestranteId: evento.palestranteId,
      tema: evento.tema ?? "",
      cargaHoraria: evento.cargaHoraria ?? 1,
      questionario: evento.questionario ?? questionarioVazio(),
    });
    setModalAberto(true);
  }

  function atualizarEnunciado(indicePergunta: number, valor: string) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) => (i === indicePergunta ? { ...p, enunciado: valor } : p)),
    });
  }

  function atualizarAlternativa(indicePergunta: number, indiceAlternativa: number, valor: string) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) =>
        i === indicePergunta
          ? { ...p, alternativas: p.alternativas.map((a, j) => (j === indiceAlternativa ? { ...a, texto: valor } : a)) }
          : p,
      ),
    });
  }

  // marca uma alternativa como correta, as outras 3 da mesma pergunta viram falsas
  function marcarCorreta(indicePergunta: number, indiceAlternativa: number) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) =>
        i === indicePergunta
          ? { ...p, alternativas: p.alternativas.map((a, j) => ({ ...a, correta: j === indiceAlternativa })) }
          : p,
      ),
    });
  }

  function validar(): string | null {
    if (!form.titulo.trim()) return "Preencha o título do evento.";
    if (!form.tema.trim()) return "Preencha o tema do evento.";
    if (!form.palestranteId) return "Selecione o palestrante responsável.";
    const indicePergunta = validarQuestionario(form.questionario);
    if (indicePergunta) {
      return `Preencha a pergunta ${indicePergunta}: enunciado, as 4 alternativas e marque qual é a correta.`;
    }
    return null;
  }

  function pedirSalvar() {
    const erro = validar();
    if (erro) {
      toast.error(erro);
      return;
    }
    if (editando) {
      setConfirmandoSalvar(true);
    } else {
      void salvar();
    }
  }

  async function salvar() {
    if (editando) {
      await eventoService.update(editando.id, form);
      toast.success("Evento atualizado.");
    } else {
      await eventoService.create(form);
      toast.success("Evento cadastrado.");
    }
    setConfirmandoSalvar(false);
    setModalAberto(false);
    await carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    await eventoService.remove(excluindo.id);
    toast.success("Evento removido.");
    setExcluindo(null);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Eventos"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={salas.length === 0 || palestrantes.length === 0}>
            + Novo evento
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Sala</th>
              <th>Data/Horário</th>
              <th>Palestrante</th>
              <th>Tema</th>
              <th>Carga horária</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventos.map((evento) => (
              <tr key={evento.id}>
                <td>{evento.titulo}</td>
                <td>{salas.find((s) => s.id === evento.salaId)?.nome ?? "—"}</td>
                <td>{evento.horario ? new Date(evento.horario).toLocaleString("pt-BR") : "—"}</td>
                <td>{palestrantes.find((p) => p.id === evento.palestranteId)?.nome ?? "—"}</td>
                <td className="truncate">{evento.tema || "—"}</td>
                <td>{evento.cargaHoraria ? `${evento.cargaHoraria}h` : "—"}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(evento)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(evento)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {eventos.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-cell">
                  Nenhum evento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar evento" : "Novo evento"} onClose={() => setModalAberto(false)} wide>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              pedirSalvar();
            }}
          >
            <label className="field">
              <span>Título</span>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Sala</span>
                <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })} required>
                  {salas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} ({s.capacidade} lugares)
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Data/Horário</span>
                <input
                  type="datetime-local"
                  value={form.horario}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })}
                  required
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Palestrante</span>
                <select
                  value={form.palestranteId}
                  onChange={(e) => setForm({ ...form, palestranteId: e.target.value })}
                  required
                >
                  {palestrantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tema</span>
                <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} required />
              </label>
            </div>
            <label className="field">
              <span>Carga horária (horas)</span>
              <input
                type="number"
                min={1}
                step={0.5}
                value={form.cargaHoraria}
                onChange={(e) => setForm({ ...form, cargaHoraria: Number(e.target.value) })}
                required
              />
            </label>

            <div className="field">
              <span>Questionário obrigatório (10 perguntas, definidas pelo palestrante)</span>
              <div className="questionario-builder">
                {form.questionario.map((pergunta, indicePergunta) => (
                  <div className="questionario-pergunta" key={pergunta.id}>
                    <div className="questionario-pergunta-titulo">Pergunta {indicePergunta + 1} de 10</div>
                    <input
                      value={pergunta.enunciado}
                      onChange={(e) => atualizarEnunciado(indicePergunta, e.target.value)}
                      placeholder="Enunciado da pergunta"
                    />
                    {pergunta.alternativas.map((alternativa, indiceAlternativa) => (
                      <div className="questionario-alternativa" key={indiceAlternativa}>
                        <input
                          type="radio"
                          name={`correta-${pergunta.id}`}
                          checked={alternativa.correta}
                          onChange={() => marcarCorreta(indicePergunta, indiceAlternativa)}
                          aria-label={`Marcar alternativa ${indiceAlternativa + 1} como correta`}
                        />
                        <input
                          type="text"
                          value={alternativa.texto}
                          onChange={(e) => atualizarAlternativa(indicePergunta, indiceAlternativa, e.target.value)}
                          placeholder={`Alternativa ${indiceAlternativa + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

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

      {confirmandoSalvar && (
        <ConfirmDialog
          title="Confirmar alteração"
          message={`Salvar as alterações do evento "${form.titulo}"?`}
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover evento"
          message={`Tem certeza que deseja remover "${excluindo.titulo}"? Inscrições e feedbacks vinculados também serão removidos.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
