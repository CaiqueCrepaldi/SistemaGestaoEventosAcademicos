import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { eventoService, palestranteService } from "../../services";
import type { Palestrante } from "../../types";
import { maskTelefone, validarEmail, validarNome, validarTelefone } from "../../utils/validacao";

const VAZIO: Omit<Palestrante, "id"> = { nome: "", email: "", telefone: "" };

export function PalestrantesPage() {
  const { usuario } = useAuth();
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Palestrante | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Palestrante | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setPalestrantes(await palestranteService.list());
  }

  // ALUNO ve uma versao read-only, sem chegar nas funcoes de CRUD abaixo
  if (usuario?.perfil === "ALUNO") {
    return (
      <div>
        <PageHeader title="Palestrantes" />
        <div className="card">
          <ul className="simple-list">
            {palestrantes.map((palestrante) => (
              <li key={palestrante.id} className="simple-list-item">
                <div className="simple-list-title">{palestrante.nome}</div>
                <div className="simple-list-sub">{palestrante.email}</div>
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
    setForm({ nome: palestrante.nome, email: palestrante.email, telefone: palestrante.telefone });
    setModalAberto(true);
  }

  function validar(): string | null {
    if (!validarNome(form.nome)) return "Nome deve conter apenas letras.";
    if (!validarEmail(form.email)) return "E-mail em formato inválido.";
    if (!validarTelefone(form.telefone)) return "Telefone deve estar no formato (00) 00000-0000.";
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
      await palestranteService.update(editando.id, form);
      toast.success("Palestrante atualizado.");
    } else {
      await palestranteService.create(form);
      toast.success("Palestrante cadastrado.");
    }
    setConfirmandoSalvar(false);
    setModalAberto(false);
    await carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    // evento sempre precisa de palestrante, entao bloqueia se tiver vinculo
    const eventos = await eventoService.list();
    if (eventos.some((e) => e.palestranteId === excluindo.id)) {
      toast.error("Não é possível remover: há eventos vinculados a este palestrante.");
      setExcluindo(null);
      return;
    }
    await palestranteService.remove(excluindo.id);
    toast.success("Palestrante removido.");
    setExcluindo(null);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Palestrantes"
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
              <th>E-mail</th>
              <th>Telefone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {palestrantes.map((palestrante) => (
              <tr key={palestrante.id}>
                <td>{palestrante.nome}</td>
                <td>{palestrante.email}</td>
                <td>{palestrante.telefone}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(palestrante)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(palestrante)}>
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
              pedirSalvar();
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })}
                placeholder="(00) 00000-0000"
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

      {confirmandoSalvar && (
        <ConfirmDialog
          title="Confirmar alteração"
          message={`Salvar as alterações do palestrante "${form.nome}"?`}
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover palestrante"
          message={`Tem certeza que deseja remover "${excluindo.nome}"? Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
