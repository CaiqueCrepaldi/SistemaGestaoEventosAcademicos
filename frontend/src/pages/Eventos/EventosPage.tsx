import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
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

function formVazio(salas: Sala[]): Omit<Evento, "id"> {
  return {
    titulo: "",
    horario: "",
    salaId: salas[0]?.id ?? "",
    palestranteId: null,
    tema: "",
    cargaHoraria: 1,
    perguntas: [],
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
  const [form, setForm] = useState<Omit<Evento, "id">>(formVazio([]));

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

  // Chamado pelo botão "Inscrever-se". Guarda de segurança: se por algum
  // motivo quem clicou não tiver participanteId (não deveria acontecer,
  // já que só ALUNO vê esse botão), avisa e não deixa continuar.
  async function inscreverSe(evento: Evento) {
    if (!usuario?.participanteId) {
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: "Disponível apenas para contas de aluno." }));
      return;
    }

    try {
      // Passo 1: cria a inscrição. Passo 2: dispara o e-mail de
      // confirmação. Os dois são chamadas separadas de propósito — se o
      // e-mail falhar, a inscrição já criada no passo 1 continua valendo.
      const nova = await inscricaoAlunoService.inscrever(usuario.participanteId, evento.id);
      setInscricoes((prev) => [...prev, nova]);

      const { destinatario } = await emailService.enviarConfirmacaoInscricao(nova);
      setAvisoPorEvento((prev) => ({
        ...prev,
        [evento.id]: `Inscrição confirmada. E-mail de confirmação enviado para ${destinatario}.`,
      }));
    } catch (e) {
      // Erros esperados (já inscrito, sem vaga) chegam como ApiError com
      // mensagem pronta pra mostrar; qualquer outro erro cai numa mensagem genérica.
      const mensagem = e instanceof ApiError ? e.message : "Não foi possível concluir a inscrição.";
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
    }
  }

  // Divisão por perfil: ALUNO recebe aqui embaixo uma lista somente-leitura
  // com botão de inscrição embutido, e a função já retorna sem chegar nas
  // funções de cadastro (abrirNovo, salvar, excluir) mais abaixo. Só
  // ADMINISTRADOR/SECRETARIA passam dessa checagem e veem a tela com CRUD completo.
  if (usuario?.perfil === "ALUNO") {
    return (
      <div>
        <PageHeader title="Eventos" subtitle="Programação completa e inscrição direta em cada evento" />
        <div className="card">
          <ul className="agenda-list">
            {eventos.map((evento) => {
              const sala = salas.find((s) => s.id === evento.salaId);
              const palestrante = palestrantes.find((p) => p.id === evento.palestranteId);
              // Boolean que decide se o botão mostra "Inscrever-se" (ainda
              // pode) ou "Inscrito"/desabilitado (já está na lista) — true
              // se já existir uma inscrição desse aluno pra esse evento.
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
    setForm(formVazio(salas));
    setModalAberto(true);
  }

  function abrirEdicao(evento: Evento) {
    setEditando(evento);
    setForm({
      titulo: evento.titulo,
      horario: evento.horario,
      salaId: evento.salaId,
      palestranteId: evento.palestranteId ?? null,
      tema: evento.tema ?? "",
      cargaHoraria: evento.cargaHoraria ?? 1,
      perguntas: evento.perguntas ?? [],
    });
    setModalAberto(true);
  }

  // As três funções abaixo mexem na lista de perguntas do questionário
  // dentro do formulário (form.perguntas é um array de strings).

  // Adiciona uma pergunta em branco no fim da lista, pra digitar.
  function adicionarPergunta() {
    setForm({ ...form, perguntas: [...form.perguntas, ""] });
  }

  // Atualiza só a pergunta do índice digitado, mantendo as outras iguais.
  function atualizarPergunta(indice: number, valor: string) {
    setForm({ ...form, perguntas: form.perguntas.map((p, i) => (i === indice ? valor : p)) });
  }

  // Remove a pergunta daquele índice da lista.
  function removerPergunta(indice: number) {
    setForm({ ...form, perguntas: form.perguntas.filter((_, i) => i !== indice) });
  }

  async function salvar() {
    // Antes de salvar, tira espaços em branco de cada pergunta e descarta
    // as que ficaram vazias — evita salvar pergunta "em branco" por engano.
    const dados = { ...form, perguntas: form.perguntas.map((p) => p.trim()).filter(Boolean) };
    // if/else: editando preenchido → update; vazio → create.
    if (editando) {
      await eventoService.update(editando.id, dados);
    } else {
      await eventoService.create(dados);
    }
    setModalAberto(false);
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este evento?")) return;
    await eventoService.remove(id);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Palestras, minicursos e workshops cadastrados"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={salas.length === 0}>
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
              <th>Horário</th>
              <th>Palestrante</th>
              <th>Tema</th>
              <th>Carga horária</th>
              <th>Perguntas</th>
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
                <td>{evento.perguntas?.length ? `${evento.perguntas.length} pergunta(s)` : "—"}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(evento)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => excluir(evento.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {eventos.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-cell">
                  Nenhum evento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar evento" : "Novo evento"} onClose={() => setModalAberto(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
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
                <span>Horário</span>
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
                  value={form.palestranteId ?? ""}
                  onChange={(e) => setForm({ ...form, palestranteId: e.target.value || null })}
                >
                  <option value="">Sem palestrante definido</option>
                  {palestrantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tema</span>
                <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
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
              <span>Perguntas do questionário (opcional)</span>
              {form.perguntas.map((pergunta, indice) => (
                <div className="pergunta-item" key={indice}>
                  <input
                    value={pergunta}
                    onChange={(e) => atualizarPergunta(indice, e.target.value)}
                    placeholder={`Pergunta ${indice + 1}`}
                  />
                  <button type="button" className="btn btn-ghost btn-danger" onClick={() => removerPergunta(indice)}>
                    Remover
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={adicionarPergunta}>
                + Adicionar pergunta
              </button>
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
    </div>
  );
}
