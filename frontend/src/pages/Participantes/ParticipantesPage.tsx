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
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Participante | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Participante | null>(null);
  const [inativando, setInativando] = useState<Participante | null>(null);
  const [motivoInativacao, setMotivoInativacao] = useState("");

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setParticipantes(await participanteService.list());
  }

  function abrirEdicao(participante: Participante) {
    setEditando(participante);
    setForm({ nome: participante.nome, email: participante.email, rgm: participante.rgm });
    setModalAberto(true);
  }

  function pedirSalvar() {
    if (!validarNome(form.nome)) return void toast.error("Nome deve conter apenas letras.");
    if (!validarEmail(form.email)) return void toast.error("E-mail em formato inválido.");
    if (!validarRgm(form.rgm)) return void toast.error("RGM deve ter exatamente 11 dígitos, sem espaços.");
    setConfirmandoSalvar(true);
  }

  async function salvar() {
    if (!editando) return;

    try {
      await participanteService.update(editando.id, form);
      toast.success("Participante atualizado.");
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o participante.");
    }
  }

  async function excluir() {
    if (!excluindo) return;

    try {
      await participanteService.remove(excluindo.id);
      toast.success("Participante removido.");
      setExcluindo(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível remover o participante.");
    }
  }

  function abrirInativacao(participante: Participante) {
    setInativando(participante);
    setMotivoInativacao("");
  }

  async function alterarAtivo() {
    if (!inativando) return;
    const ativo = inativando.ativo === false;

    if (!ativo && !motivoInativacao.trim()) {
      toast.error("Informe o motivo da inativação.");
      return;
    }

    try {
      await participanteService.update(inativando.id, {
        ativo,
        motivoInativacao: ativo ? null : motivoInativacao.trim(),
      });
      toast.success(ativo ? "Aluno reativado." : "Aluno inativado.");
      setInativando(null);
      setMotivoInativacao("");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar o status do aluno.");
    }
  }

  const filtrados = participantes.filter((p) => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return true;
    return p.nome.toLowerCase().includes(alvo) || p.email.toLowerCase().includes(alvo) || p.rgm.includes(alvo);
  });

  return (
    <div>
      <PageHeader title="Participantes" />

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
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((participante) => (
              <tr key={participante.id}>
                <td>{participante.nome}</td>
                <td>{participante.email}</td>
                <td>{participante.rgm}</td>
                <td>{participante.ativo === false ? "Inativo" : "Ativo"}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(participante)}>Editar</button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => (participante.ativo === false ? setInativando(participante) : abrirInativacao(participante))}
                  >
                    {participante.ativo === false ? "Reativar" : "Inativar"}
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(participante)}>Excluir</button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Nenhum participante encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && editando && (
        <Modal title="Editar participante" onClose={() => setModalAberto(false)}>
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
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label className="field">
              <span>RGM</span>
              <input
                value={form.rgm}
                onChange={(e) => setForm({ ...form, rgm: normalizarRgm(e.target.value) })}
                placeholder="11 dígitos"
                inputMode="numeric"
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

      {inativando && (
        <Modal
          title={inativando.ativo === false ? "Reativar aluno" : "Inativar aluno"}
          onClose={() => setInativando(null)}
        >
          {inativando.ativo === false ? (
            <p>Deseja reativar o acesso de {inativando.nome}?</p>
          ) : (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void alterarAtivo();
              }}
            >
              <p>O aluno perderá o acesso ao sistema, mas seu histórico será preservado.</p>
              <label className="field">
                <span>Motivo da inativação</span>
                <textarea
                  value={motivoInativacao}
                  onChange={(e) => setMotivoInativacao(e.target.value)}
                  rows={4}
                  maxLength={500}
                  required
                  autoFocus
                />
              </label>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setInativando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger-solid">
                  Inativar
                </button>
              </div>
            </form>
          )}
          {inativando.ativo === false && (
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setInativando(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void alterarAtivo()}>
                Reativar
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
