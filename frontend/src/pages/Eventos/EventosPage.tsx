import { useEffect, useState } from "react";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, eventoService, palestranteService, salaService } from "../../services";
import type { Evento, Palestrante, PerguntaQuestionario, Sala } from "../../types";
import { inputLocalParaIso, isoParaInputLocal } from "../../utils/data";
import { ALTERNATIVAS_POR_PERGUNTA, questionarioVazio } from "../../utils/questionario";
import { EventosAluno } from "./EventosAluno";

interface FormEvento {
  titulo: string;
  horario: string;
  salaId: string;
  palestranteId: string;
  tema: string;
  // texto no formulario pra campo vazio nao virar 0 sozinho
  cargaHoraria: string;
  questionario: PerguntaQuestionario[];
}

function formVazio(): FormEvento {
  return { titulo: "", horario: "", salaId: "", palestranteId: "", tema: "", cargaHoraria: "", questionario: questionarioVazio() };
}

// chaves de erro do questionario seguem o caminho que o backend devolve (questionario.3.enunciado...)
const chaveEnunciado = (i: number) => `questionario.${i}.enunciado`;
const chaveAlternativa = (i: number, j: number) => `questionario.${i}.alternativas.${j}.texto`;
const chaveCorreta = (i: number) => `questionario.${i}.correta`;

function validarEvento(form: FormEvento): ErrosFormulario {
  const erros: ErrosFormulario = {};
  if (!form.titulo.trim()) erros.titulo = "Informe o título do evento.";
  if (!form.salaId) erros.salaId = "Selecione a sala.";
  if (!form.horario) erros.horario = "Informe a data e o horário.";
  if (!form.palestranteId) erros.palestranteId = "Selecione o palestrante responsável.";
  if (!form.tema.trim()) erros.tema = "Informe o tema do evento.";
  const carga = Number(form.cargaHoraria);
  if (!form.cargaHoraria.trim()) erros.cargaHoraria = "Informe a carga horária.";
  else if (!(carga > 0)) erros.cargaHoraria = "A carga horária deve ser maior que zero.";

  form.questionario.forEach((pergunta, i) => {
    if (!pergunta.enunciado.trim()) erros[chaveEnunciado(i)] = `Escreva o enunciado da pergunta ${i + 1}.`;
    pergunta.alternativas.forEach((alternativa, j) => {
      if (!alternativa.texto.trim()) erros[chaveAlternativa(i, j)] = `Preencha a alternativa ${j + 1}.`;
    });
    if (pergunta.alternativas.filter((a) => a.correta).length !== 1) erros[chaveCorreta(i)] = "Marque qual alternativa é a correta.";
  });
  return erros;
}

// aluno ve a programacao com inscrever/cancelar (EventosAluno.tsx); equipe ve a gestao (crud) abaixo
export function EventosPage() {
  const { usuario } = useAuth();
  return usuario?.perfil === "ALUNO" ? <EventosAluno /> : <EventosEquipe />;
}

// crud de eventos da equipe, com a ocupacao (inscritos/capacidade) de cada evento
function EventosEquipe() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [busca, setBusca] = useState("");
  // enquanto carrega a tabela diz "Carregando" (e nao "Nenhum evento cadastrado")
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState<FormEvento>(formVazio());
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Evento | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca eventos/salas/palestrantes de uma vez (a contagem de inscritos ja vem em cada evento)
  async function carregar() {
    try {
      const [e, sa, p] = await Promise.all([eventoService.list(), salaService.list(), palestranteService.list()]);
      setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario)));
      setSalas(sa);
      setPalestrantes(p);
    } finally {
      setCarregando(false);
    }
  }

  const nomeDaSala = (evento: Evento) => salas.find((s) => s.id === evento.salaId)?.nome ?? "—";
  const nomeDoPalestrante = (evento: Evento) => palestrantes.find((p) => p.id === evento.palestranteId)?.nome ?? "—";
  // a busca filtra a lista ja carregada: titulo, tema, palestrante ou sala
  const termo = busca.trim().toLowerCase();
  const eventosVisiveis = termo
    ? eventos.filter((e) =>
        `${e.titulo} ${e.tema ?? ""} ${nomeDoPalestrante(e)} ${nomeDaSala(e)}`.toLowerCase().includes(termo),
      )
    : eventos;

  // abre o modal em branco (sala e palestrante escolhidos de proposito, nao pre-selecionados)
  function abrirNovo() {
    setEditando(null);
    setForm(formVazio());
    limpar();
    setModalAberto(true);
  }

  // abre o modal ja preenchido com os dados do evento clicado
  function abrirEdicao(evento: Evento) {
    setEditando(evento);
    setForm({
      titulo: evento.titulo,
      horario: isoParaInputLocal(evento.horario),
      salaId: evento.salaId,
      palestranteId: evento.palestranteId,
      tema: evento.tema ?? "",
      cargaHoraria: String(evento.cargaHoraria ?? ""),
      questionario: evento.questionario ?? questionarioVazio(),
    });
    limpar();
    setModalAberto(true);
  }

  // atualiza o enunciado de uma pergunta especifica
  function atualizarEnunciado(indicePergunta: number, valor: string) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) => (i === indicePergunta ? { ...p, enunciado: valor } : p)),
    });
  }

  // atualiza o texto de uma alternativa especifica
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
    limpar(chaveCorreta(indicePergunta));
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) =>
        i === indicePergunta
          ? { ...p, alternativas: p.alternativas.map((a, j) => ({ ...a, correta: j === indiceAlternativa })) }
          : p,
      ),
    });
  }

  // valida, e se for edicao pede confirmacao antes de gravar
  function pedirSalvar() {
    if (mostrar(validarEvento(form))) return;
    if (editando) setConfirmandoSalvar(true);
    else void salvar();
  }

  // cria ou atualiza dependendo se ta editando, convertendo o horario do input (fuso local) pra ISO
  async function salvar() {
    const dados = { ...form, cargaHoraria: Number(form.cargaHoraria), horario: inputLocalParaIso(form.horario) };
    try {
      if (editando) {
        await eventoService.update(editando.id, dados);
        toast.success("Evento atualizado.");
      } else {
        await eventoService.create(dados);
        toast.success("Evento cadastrado.");
      }
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (e) {
      setConfirmandoSalvar(false);
      // sala ja ocupada nesse horario por outro evento: a mensagem do backend (com o titulo do outro
      // evento) aparece embaixo do campo de data/horario
      if (e instanceof ApiError && e.code === "CONFLITO_DE_SALA") {
        mostrar({ horario: e.message });
        return;
      }
      // a regra de "exatamente 1 correta" o backend devolve em questionario.N.alternativas
      const tratou = mostrarErroDaApi(e, (campo) => campo.replace(/^(questionario\.\d+)\.alternativas$/, "$1.correta"));
      if (!tratou) toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar o evento.");
    }
  }

  // evento com inscricao nao e excluido (o backend responde 409): avisa direto, sem abrir a confirmacao
  function pedirExclusao(evento: Evento) {
    const inscritos = evento.inscritos ?? 0;
    if (inscritos > 0) {
      toast.error(
        `"${evento.titulo}" tem ${inscritos} ${inscritos === 1 ? "inscrição" : "inscrições"}. Cancele as inscrições antes de excluir o evento.`,
      );
      return;
    }
    setExcluindo(evento);
  }

  // so evento sem nenhuma inscricao e excluido; nada mais e apagado em cascata
  async function excluir() {
    if (!excluindo) return;
    try {
      await eventoService.remove(excluindo.id);
      toast.success("Evento removido.");
      setExcluindo(null);
      await carregar();
    } catch (e) {
      setExcluindo(null);
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o evento.");
    }
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
        <input
          className="search-input"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, tema, palestrante ou sala"
          aria-label="Buscar eventos"
          style={{ marginBottom: 12 }}
        />
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Sala</th>
              <th>Data/Horário</th>
              <th>Palestrante</th>
              <th>Tema</th>
              <th>Carga horária</th>
              <th>Inscritos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventosVisiveis.map((evento) => (
              <tr key={evento.id}>
                <td>{evento.titulo}</td>
                <td>{nomeDaSala(evento)}</td>
                <td>{evento.horario ? new Date(evento.horario).toLocaleString("pt-BR") : "—"}</td>
                <td>{nomeDoPalestrante(evento)}</td>
                <td className="truncate">{evento.tema || "—"}</td>
                <td>{evento.cargaHoraria ? `${evento.cargaHoraria}h` : "—"}</td>
                <td>
                  {evento.inscritos ?? 0}/{salas.find((s) => s.id === evento.salaId)?.capacidade ?? "—"}
                </td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(evento)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => pedirExclusao(evento)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {eventosVisiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-cell">
                  {carregando ? "Carregando…" : eventos.length === 0 ? "Nenhum evento cadastrado." : "Nenhum evento encontrado para a busca."}
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
            ref={formRef}
            noValidate
            onChange={limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              pedirSalvar();
            }}
          >
            <LegendaObrigatorio />
            <Campo nome="titulo" rotulo="Título" obrigatorio erro={erros.titulo}>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} autoFocus />
            </Campo>
            <div className="field-row">
              <Campo nome="salaId" rotulo="Sala" obrigatorio erro={erros.salaId}>
                <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {salas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} ({s.capacidade} lugares)
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="horario" rotulo="Data/Horário" obrigatorio erro={erros.horario}>
                <input type="datetime-local" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
              </Campo>
            </div>
            <div className="field-row">
              <Campo nome="palestranteId" rotulo="Palestrante" obrigatorio erro={erros.palestranteId}>
                <select value={form.palestranteId} onChange={(e) => setForm({ ...form, palestranteId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {palestrantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="tema" rotulo="Tema" obrigatorio erro={erros.tema}>
                <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
              </Campo>
            </div>
            <Campo nome="cargaHoraria" rotulo="Carga horária (horas)" obrigatorio erro={erros.cargaHoraria}>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={form.cargaHoraria}
                onChange={(e) => setForm({ ...form, cargaHoraria: e.target.value })}
              />
            </Campo>

            <div className="field">
              <span>
                Questionário obrigatório (10 perguntas, definidas pelo palestrante)
                <MarcaObrigatorio />
              </span>
              <p className="form-hint" style={{ margin: 0 }}>
                Em cada pergunta, preencha o enunciado e as 4 alternativas e marque a correta.
              </p>
              <div className="questionario-builder">
                {form.questionario.map((pergunta, indicePergunta) => {
                  const erroEnunciado = erros[chaveEnunciado(indicePergunta)];
                  const alternativasComErro = pergunta.alternativas
                    .map((_, j) => j)
                    .filter((j) => erros[chaveAlternativa(indicePergunta, j)]);
                  const erroCorreta = erros[chaveCorreta(indicePergunta)];
                  const temErro = Boolean(erroEnunciado || alternativasComErro.length || erroCorreta);
                  return (
                    <div className={"questionario-pergunta" + (temErro ? " grupo-invalido" : "")} key={pergunta.id}>
                      <div className="questionario-pergunta-titulo">Pergunta {indicePergunta + 1} de 10</div>
                      <input
                        name={chaveEnunciado(indicePergunta)}
                        value={pergunta.enunciado}
                        onChange={(e) => atualizarEnunciado(indicePergunta, e.target.value)}
                        placeholder="Enunciado da pergunta"
                        aria-label={`Enunciado da pergunta ${indicePergunta + 1}`}
                        aria-invalid={erroEnunciado ? true : undefined}
                        className={erroEnunciado ? "campo-invalido" : undefined}
                      />
                      {erroEnunciado && <p className="form-error">{erroEnunciado}</p>}
                      {pergunta.alternativas.map((alternativa, indiceAlternativa) => {
                        const erroAlternativa = erros[chaveAlternativa(indicePergunta, indiceAlternativa)];
                        return (
                          <div className="questionario-alternativa" key={indiceAlternativa}>
                            <input
                              type="radio"
                              name={`correta-${pergunta.id}`}
                              checked={alternativa.correta}
                              onChange={() => marcarCorreta(indicePergunta, indiceAlternativa)}
                              aria-label={`Marcar alternativa ${indiceAlternativa + 1} como correta`}
                              aria-invalid={erroCorreta && indiceAlternativa === 0 ? true : undefined}
                            />
                            <input
                              type="text"
                              name={chaveAlternativa(indicePergunta, indiceAlternativa)}
                              value={alternativa.texto}
                              onChange={(e) => atualizarAlternativa(indicePergunta, indiceAlternativa, e.target.value)}
                              placeholder={`Alternativa ${indiceAlternativa + 1}`}
                              aria-invalid={erroAlternativa ? true : undefined}
                              className={erroAlternativa ? "campo-invalido" : undefined}
                            />
                          </div>
                        );
                      })}
                      {alternativasComErro.length > 0 && (
                        <p className="form-error">
                          {alternativasComErro.length === ALTERNATIVAS_POR_PERGUNTA
                            ? "Preencha as 4 alternativas."
                            : `Preencha a(s) alternativa(s) ${alternativasComErro.map((j) => j + 1).join(", ")}.`}
                        </p>
                      )}
                      {erroCorreta && <p className="form-error">{erroCorreta}</p>}
                    </div>
                  );
                })}
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
          message={`Tem certeza que deseja remover "${excluindo.titulo}"? Essa ação não pode ser desfeita. Eventos com inscrições não podem ser excluídos: cancele as inscrições antes.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
