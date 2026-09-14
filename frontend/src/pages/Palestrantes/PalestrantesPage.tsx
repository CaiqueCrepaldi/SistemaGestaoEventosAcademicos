import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { palestranteService } from "../../services";
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

  // busca a lista atualizada de palestrantes
  async function carregar() {
    setPalestrantes(await palestranteService.list());
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

  function pedirSalvar() {
    if (!validarNome(form.nome)) return void toast.error("Nome deve conter apenas letras.");
    if (!validarEmail(form.email)) return void toast.error("E-mail em formato inválido.");
    if (!validarTelefone(form.telefone)) return void toast.error("Telefone deve estar no formato (00) 00000-0000.");
    if (editando) setConfirmandoSalvar(true);
    else void salvar();
  }

  async function salvar() {
    try {
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
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o palestrante.");
    }
  }

  async function excluir() {
    if (!excluindo) return;
    try {
      await palestranteService.remove(excluindo.id);
      toast.success("Palestrante removido.");
      setExcluindo(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover o palestrante.");
    }
  }

  // ALUNO ve uma versao mais simples, sem telefone (backend ja tira esse campo pra esse perfil)
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

  return (
    <div>
      <PageHeader title="Palestrantes" actions={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo palestrante</button>} />

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
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(palestrante)}>Editar</button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(palestrante)}>Excluir</button>
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
          <form className="form" onSubmit={(e) => { e.preventDefault(); pedirSalvar(); }}>
            <label className="field">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })} placeholder="(00) 00000-0000" required />
            </label>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmandoSalvar && (
        <ConfirmDialog
          title="Confirmar alteração"
          message={`Salvar as alterações de "${form.nome}"?`}
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
