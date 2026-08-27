import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService, palestranteService, salaService, sessaoService } from "../../services";
import type { Evento, Palestrante, Sala, Sessao } from "../../types";

function formVazio(eventos: Evento[], salas: Sala[]): Omit<Sessao, "id"> {
  return {
    eventoId: eventos[0]?.id ?? "",
    titulo: "",
    horario: "",
    salaId: salas[0]?.id ?? "",
    palestranteId: null,
    tema: "",
  };
}

export function SessoesPage() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [filtroEvento, setFiltroEvento] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Sessao | null>(null);
  const [form, setForm] = useState<Omit<Sessao, "id">>({
    eventoId: "",
    titulo: "",
    horario: "",
    salaId: "",
    palestranteId: null,
    tema: "",
  });

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [s, e, sa, p] = await Promise.all([
      sessaoService.list(),
      eventoService.list(),
      salaService.list(),
      palestranteService.list(),
    ]);
    setSessoes(s);
    setEventos(e);
    setSalas(sa);
    setPalestrantes(p);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio(eventos, salas));
    setModalAberto(true);
  }

  function abrirEdicao(sessao: Sessao) {
    setEditando(sessao);
    setForm({
      eventoId: sessao.eventoId,
      titulo: sessao.titulo,
      horario: sessao.horario,
      salaId: sessao.salaId,
      palestranteId: sessao.palestranteId ?? null,
      tema: sessao.tema ?? "",
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (editando) {
      await sessaoService.update(editando.id, form);
    } else {
      await sessaoService.create(form);
    }
    setModalAberto(false);
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover esta sessão?")) return;
    await sessaoService.remove(id);
    await carregar();
  }

  const listadas = sessoes
    .filter((s) => !filtroEvento || s.eventoId === filtroEvento)
    .sort((a, b) => a.horario.localeCompare(b.horario));

  return (
    <div>
      <PageHeader
        title="Sessões"
        subtitle="Palestras, minicursos e workshops de cada evento"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={eventos.length === 0 || salas.length === 0}>
            + Nova sessão
          </button>
        }
      />

      <div className="card">
        <select className="search-input" value={filtroEvento} onChange={(e) => setFiltroEvento(e.target.value)}>
          <option value="">Todos os eventos</option>
          {eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Evento</th>
              <th>Sala</th>
              <th>Horário</th>
              <th>Palestrante</th>
              <th>Tema</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {listadas.map((sessao) => (
              <tr key={sessao.id}>
                <td>{sessao.titulo}</td>
                <td>{eventos.find((e) => e.id === sessao.eventoId)?.nome ?? "—"}</td>
                <td>{salas.find((s) => s.id === sessao.salaId)?.nome ?? "—"}</td>
                <td>{sessao.horario ? new Date(sessao.horario).toLocaleString("pt-BR") : "—"}</td>
                <td>{palestrantes.find((p) => p.id === sessao.palestranteId)?.nome ?? "—"}</td>
                <td className="truncate">{sessao.tema || "—"}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(sessao)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => excluir(sessao.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {listadas.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-cell">
                  Nenhuma sessão cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar sessão" : "Nova sessão"} onClose={() => setModalAberto(false)}>
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
                <span>Sala</span>
                <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })} required>
                  {salas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} ({s.capacidade} lugares)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Horário</span>
              <input
                type="datetime-local"
                value={form.horario}
                onChange={(e) => setForm({ ...form, horario: e.target.value })}
                required
              />
            </label>
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
