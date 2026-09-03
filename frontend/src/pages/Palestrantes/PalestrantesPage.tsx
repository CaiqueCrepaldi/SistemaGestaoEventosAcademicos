import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { palestranteService } from "../../services";
import type { Palestrante } from "../../types";

const VAZIO: Omit<Palestrante, "id"> = { nome: "", curriculo: "", telefone: "" };

export function PalestrantesPage() {
  const { usuario } = useAuth();
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Palestrante | null>(null);
  const [form, setForm] = useState(VAZIO);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setPalestrantes(await palestranteService.list());
  }

  // Aqui é onde a tela se divide por perfil: se for ALUNO, a função já
  // retorna (return antecipado) uma versão simples e somente-leitura da
  // tela, sem chegar nas funções de abrir modal/salvar/excluir mais abaixo.
  // Só ADMINISTRADOR/SECRETARIA chegam até a versão completa com CRUD.
  if (usuario?.perfil === "ALUNO") {
    return (
      <div>
        <PageHeader title="Palestrantes" subtitle="Palestrantes convidados dos eventos" />
        <div className="card">
          <ul className="simple-list">
            {palestrantes.map((palestrante) => (
              <li key={palestrante.id} className="simple-list-item">
                <div className="simple-list-title">{palestrante.nome}</div>
                {/* TODO: backend não deve retornar telefone para perfil ALUNO (ver docs/api-contract.md) */}
                <div className="simple-list-sub">{palestrante.curriculo}</div>
              </li>
            ))}
            {palestrantes.length === 0 && <p className="empty-cell">Nenhum palestrante cadastrado.</p>}
          </ul>
        </div>
      </div>
    );
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(palestrante: Palestrante) {
    setEditando(palestrante);
    setForm({ nome: palestrante.nome, curriculo: palestrante.curriculo, telefone: palestrante.telefone });
    setModalAberto(true);
  }

  // if/else clássico: com `editando` preenchido é edição (update), vazio é
  // cadastro novo (create) — mesmo formulário e botão pros dois casos.
  async function salvar() {
    if (editando) {
      await palestranteService.update(editando.id, form);
    } else {
      await palestranteService.create(form);
    }
    setModalAberto(false);
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este palestrante?")) return;
    await palestranteService.remove(id);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Palestrantes"
        subtitle="Cadastro de palestrantes convidados"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo palestrante
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Currículo</th>
              <th>Telefone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {palestrantes.map((palestrante) => (
              <tr key={palestrante.id}>
                <td>{palestrante.nome}</td>
                <td className="truncate">{palestrante.curriculo}</td>
                <td>{palestrante.telefone}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(palestrante)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => excluir(palestrante.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {palestrantes.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  Nenhum palestrante cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar palestrante" : "Novo palestrante"} onClose={() => setModalAberto(false)}>
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
              <span>Currículo</span>
              <textarea
                value={form.curriculo}
                onChange={(e) => setForm({ ...form, curriculo: e.target.value })}
                rows={3}
              />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
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
