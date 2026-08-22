import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { participanteService, trabalhoService } from "../../services";
import type { Participante, StatusTrabalho, Trabalho } from "../../types";

function badgeTone(status: StatusTrabalho): "green" | "red" | "orange" {
  if (status === "APROVADO") return "green";
  if (status === "REJEITADO") return "red";
  return "orange";
}

function badgeLabel(status: StatusTrabalho): string {
  if (status === "APROVADO") return "Aprovado";
  if (status === "REJEITADO") return "Rejeitado";
  return "Pendente";
}

function formVazio(participantes: Participante[]): Omit<Trabalho, "id"> {
  return {
    titulo: "",
    resumo: "",
    arquivo: "",
    autorId: participantes[0]?.id ?? "",
    statusAvaliacao: "PENDENTE",
  };
}

export function TrabalhosPage() {
  const [trabalhos, setTrabalhos] = useState<Trabalho[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Trabalho | null>(null);
  const [form, setForm] = useState<Omit<Trabalho, "id">>({
    titulo: "",
    resumo: "",
    arquivo: "",
    autorId: "",
    statusAvaliacao: "PENDENTE",
  });

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [t, p] = await Promise.all([trabalhoService.list(), participanteService.list()]);
    setTrabalhos(t);
    setParticipantes(p);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio(participantes));
    setModalAberto(true);
  }

  function abrirEdicao(trabalho: Trabalho) {
    setEditando(trabalho);
    setForm({
      titulo: trabalho.titulo,
      resumo: trabalho.resumo,
      arquivo: trabalho.arquivo,
      autorId: trabalho.autorId,
      statusAvaliacao: trabalho.statusAvaliacao,
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (editando) {
      await trabalhoService.update(editando.id, form);
    } else {
      await trabalhoService.create(form);
    }
    setModalAberto(false);
    await carregar();
  }

  async function alterarStatus(trabalho: Trabalho, status: StatusTrabalho) {
    await trabalhoService.update(trabalho.id, { statusAvaliacao: status });
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este trabalho?")) return;
    await trabalhoService.remove(id);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Trabalhos"
        subtitle="Submissão e avaliação de trabalhos acadêmicos"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={participantes.length === 0}>
            + Novo trabalho
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Autor</th>
              <th>Arquivo</th>
              <th>Avaliação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trabalhos.map((trabalho) => (
              <tr key={trabalho.id}>
                <td>{trabalho.titulo}</td>
                <td>{participantes.find((p) => p.id === trabalho.autorId)?.nome ?? "—"}</td>
                <td>{trabalho.arquivo || "—"}</td>
                <td>
                  <div className="field-row-inline">
                    <Badge tone={badgeTone(trabalho.statusAvaliacao)}>{badgeLabel(trabalho.statusAvaliacao)}</Badge>
                    <select
                      value={trabalho.statusAvaliacao}
                      onChange={(e) => void alterarStatus(trabalho, e.target.value as StatusTrabalho)}
                    >
                      <option value="PENDENTE">Pendente</option>
                      <option value="APROVADO">Aprovado</option>
                      <option value="REJEITADO">Rejeitado</option>
                    </select>
                  </div>
                </td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(trabalho)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => excluir(trabalho.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {trabalhos.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Nenhum trabalho submetido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar trabalho" : "Novo trabalho"} onClose={() => setModalAberto(false)} wide>
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
            <label className="field">
              <span>Resumo</span>
              <textarea value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} rows={3} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Autor</span>
                <select value={form.autorId} onChange={(e) => setForm({ ...form, autorId: e.target.value })} required>
                  {participantes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Arquivo (nome do PDF)</span>
                <input
                  value={form.arquivo}
                  onChange={(e) => setForm({ ...form, arquivo: e.target.value })}
                  placeholder="trabalho.pdf"
                />
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
