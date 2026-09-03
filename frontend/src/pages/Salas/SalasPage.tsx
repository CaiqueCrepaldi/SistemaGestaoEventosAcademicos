import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { salaService } from "../../services";
import type { Sala } from "../../types";

const VAZIO: Omit<Sala, "id"> = { nome: "", capacidade: 0 };

export function SalasPage() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Sala | null>(null);
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    void carregar();
  }, []);

  // Busca a lista atualizada de salas — chamado no carregamento da página
  // e de novo depois de qualquer criar/editar/excluir.
  async function carregar() {
    setSalas(await salaService.list());
  }

  // Abre o modal em branco, pronto pra cadastrar uma sala nova.
  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  // Abre o modal já preenchido com os dados da sala clicada em "Editar".
  function abrirEdicao(sala: Sala) {
    setEditando(sala);
    setForm({ nome: sala.nome, capacidade: sala.capacidade });
    setModalAberto(true);
  }

  // Um botão só de "Salvar" serve tanto pra criar quanto editar: se
  // `editando` tiver algo, é update; senão, é create. É esse mesmo padrão
  // if/else que se repete em todas as telas de cadastro do sistema.
  async function salvar() {
    if (editando) {
      await salaService.update(editando.id, form);
    } else {
      await salaService.create(form);
    }
    setModalAberto(false);
    await carregar();
  }

  // window.confirm mostra o alerta nativo do navegador pra confirmar a
  // exclusão; se a pessoa clicar "Cancelar", a função para aqui e nada é
  // removido.
  async function excluir(id: string) {
    if (!confirm("Remover esta sala?")) return;
    await salaService.remove(id);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Salas"
        subtitle="Espaços disponíveis para sessões"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Nova sala
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Capacidade</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {salas.map((sala) => (
              <tr key={sala.id}>
                <td>{sala.nome}</td>
                <td>{sala.capacidade} lugares</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(sala)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => excluir(sala.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {salas.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-cell">
                  Nenhuma sala cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar sala" : "Nova sala"} onClose={() => setModalAberto(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <label className="field">
              <span>Capacidade</span>
              <input
                type="number"
                min={1}
                value={form.capacidade}
                onChange={(e) => setForm({ ...form, capacidade: Number(e.target.value) })}
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
    </div>
  );
}
