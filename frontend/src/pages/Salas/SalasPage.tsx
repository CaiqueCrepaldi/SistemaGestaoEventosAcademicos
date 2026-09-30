import { useEffect, useState } from "react";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { eventoService, salaService } from "../../services";
import type { Sala } from "../../types";

// capacidade fica como texto no formulario pra campo vazio nao virar 0 sozinho
const VAZIO = { nome: "", capacidade: "" };

// crud de salas
export function SalasPage() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Sala | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Sala | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca a lista atualizada de salas
  async function carregar() {
    setSalas(await salaService.list());
  }

  // abre o modal em branco
  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    limpar();
    setModalAberto(true);
  }

  // abre o modal ja preenchido com os dados da sala clicada
  function abrirEdicao(sala: Sala) {
    setEditando(sala);
    setForm({ nome: sala.nome, capacidade: String(sala.capacidade) });
    limpar();
    setModalAberto(true);
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.nome.trim()) faltando.nome = "Informe o nome da sala.";
    const capacidade = Number(form.capacidade);
    if (!form.capacidade.trim()) faltando.capacidade = "Informe a capacidade.";
    else if (!Number.isInteger(capacidade) || capacidade <= 0) faltando.capacidade = "A capacidade deve ser um número inteiro maior que zero.";
    return faltando;
  }

  // editar pede confirmacao antes de gravar, criar nao
  function pedirSalvar() {
    if (mostrar(validar())) return;
    if (editando) setConfirmandoSalvar(true);
    else void salvar();
  }

  // cria ou atualiza dependendo se ta editando
  async function salvar() {
    const dados = { nome: form.nome.trim(), capacidade: Number(form.capacidade) };
    try {
      if (editando) {
        await salaService.update(editando.id, dados);
        toast.success("Sala atualizada.");
      } else {
        await salaService.create(dados);
        toast.success("Sala cadastrada.");
      }
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      setConfirmandoSalvar(false);
      if (!mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a sala.");
    }
  }

  // bloqueia exclusao se tiver evento vinculado, senao remove
  async function excluir() {
    if (!excluindo) return;
    // evento sempre precisa de sala, entao bloqueia se tiver vinculo
    const eventos = await eventoService.list();
    if (eventos.some((e) => e.salaId === excluindo.id)) {
      toast.error("Não é possível remover: há eventos vinculados a esta sala.");
      setExcluindo(null);
      return;
    }
    await salaService.remove(excluindo.id);
    toast.success("Sala removida.");
    setExcluindo(null);
    await carregar();
  }

  return (
    <div>
      <PageHeader
        title="Salas"
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
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(sala)}>
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
            ref={formRef}
            noValidate
            onChange={limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              pedirSalvar();
            }}
          >
            <LegendaObrigatorio />
            <Campo nome="nome" rotulo="Nome" obrigatorio erro={erros.nome}>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
            </Campo>
            <Campo nome="capacidade" rotulo="Capacidade (lugares)" obrigatorio erro={erros.capacidade}>
              <input
                type="number"
                min={1}
                step={1}
                value={form.capacidade}
                onChange={(e) => setForm({ ...form, capacidade: e.target.value })}
              />
            </Campo>
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
          message={`Salvar as alterações da sala "${form.nome}"?`}
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover sala"
          message={`Tem certeza que deseja remover a sala "${excluindo.nome}"? Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
