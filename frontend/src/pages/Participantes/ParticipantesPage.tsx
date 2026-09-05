import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { participanteService } from "../../services";
import type { Participante } from "../../types";
import { normalizarRgm, validarEmail, validarNome, validarRgm } from "../../utils/validacao";

const VAZIO: Omit<Participante, "id"> = { nome: "", email: "", rgm: "" };

export function ParticipantesPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Participante | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [busca, setBusca] = useState("");
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Participante | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setParticipantes(await participanteService.list());
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(participante: Participante) {
    setEditando(participante);
    setForm({ nome: participante.nome, email: participante.email, rgm: participante.rgm });
    setModalAberto(true);
  }

  function validar(): string | null {
    if (!validarNome(form.nome)) return "Nome deve conter apenas letras.";
    if (!validarEmail(form.email)) return "E-mail em formato inválido.";
    if (!validarRgm(form.rgm)) return "RGM deve ter exatamente 11 caracteres, sem espaços.";
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
      await participanteService.update(editando.id, form);
      toast.success("Participante atualizado.");
    } else {
      await participanteService.create(form);
      toast.success("Participante cadastrado.");
    }
    setConfirmandoSalvar(false);
    setModalAberto(false);
    await carregar();
  }

  async function excluir() {
    if (!excluindo) return;
    await participanteService.remove(excluindo.id);
    toast.success("Participante removido.");
    setExcluindo(null);
    await carregar();
  }

  const filtrados = participantes.filter((p) => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return true;
    return p.nome.toLowerCase().includes(alvo) || p.email.toLowerCase().includes(alvo) || p.rgm.includes(alvo);
  });

  return (
    <div>
      <PageHeader
        title="Participantes"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Novo participante
          </button>
        }
      />

      <div className="card">
        <input
          className="search-input"
          placeholder="Buscar por nome, e-mail ou RGM…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>RGM</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((participante) => (
              <tr key={participante.id}>
                <td>{participante.nome}</td>
                <td>{participante.email}</td>
                <td>{participante.rgm}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(participante)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(participante)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  Nenhum participante encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar participante" : "Novo participante"} onClose={() => setModalAberto(false)}>
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
              <span>RGM</span>
              <input
                value={form.rgm}
                onChange={(e) => setForm({ ...form, rgm: normalizarRgm(e.target.value) })}
                placeholder="11 caracteres, sem espaços"
                maxLength={11}
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
          message={`Salvar as alterações de "${form.nome}"?`}
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover participante"
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
