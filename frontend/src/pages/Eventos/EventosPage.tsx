import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService } from "../../services";
import type { Evento } from "../../types";

const VAZIO: Omit<Evento, "id"> = { nome: "", data: "", local: "", descricao: "" };

export function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setEventos(await eventoService.list());
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(evento: Evento) {
    setEditando(evento);
    setForm({ nome: evento.nome, data: evento.data, local: evento.local, descricao: evento.descricao });
    setModalAberto(true);
  }

  async function salvar() {
    if (editando) {
      await eventoService.update(editando.id, form);
    } else {
      await eventoService.create(form);
    }
    setModalAberto(false);
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este evento? Sessões vinculadas devem ser removidas separadamente.")) return;
    await eventoService.remove(id);
    await carregar();
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Cadastro de eventos acadêmicos"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo evento
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Data</th>
              <th>Local</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventos.map((evento) => (
              <tr key={evento.id}>
                <td>{evento.nome}</td>
                <td>{new Date(evento.data + "T00:00").toLocaleDateString("pt-BR")}</td>
                <td>{evento.local}</td>
                <td>
                  {evento.data >= hoje ? (
                    <Badge tone="green">Programado</Badge>
                  ) : (
                    <Badge tone="neutral">Encerrado</Badge>
                  )}
                </td>
                <td className="table-actions">
                  <Link className="btn btn-ghost" to={`/eventos/${evento.id}`}>
                    Ver detalhes
                  </Link>
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
                <td colSpan={5} className="empty-cell">
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
              <span>Nome do evento</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Data</span>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Local</span>
                <input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} required />
              </label>
            </div>
            <label className="field">
              <span>Descrição</span>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
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
