import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, participanteService } from "../../services";
import type { Participante } from "../../types";
import { normalizarRgm, validarEmail, validarNome, validarRgm } from "../../utils/validacao";

const VAZIO = { nome: "", email: "", rgm: "" };

// alunos cadastrados: a equipe corrige dados, inativa (com motivo) e reativa. Inativo = nao entra
// no sistema, nao se inscreve, nao faz check-in nem questionario; certificados ja emitidos valem
export function ParticipantesPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Participante | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Participante | null>(null);
  const [inativando, setInativando] = useState<Participante | null>(null);
  const [reativando, setReativando] = useState<Participante | null>(null);
  const [motivoInativacao, setMotivoInativacao] = useState("");
  const edicao = useErrosFormulario();
  const inativacao = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setParticipantes(await participanteService.list());
  }

  function abrirEdicao(participante: Participante) {
    setEditando(participante);
    setForm({ nome: participante.nome, email: participante.email, rgm: participante.rgm });
    edicao.limpar();
  }

  function validarEdicao(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.nome.trim()) faltando.nome = "Informe o nome.";
    else if (!validarNome(form.nome)) faltando.nome = "O nome deve conter apenas letras.";
    if (!form.email.trim()) faltando.email = "Informe o e-mail.";
    else if (!validarEmail(form.email)) faltando.email = "Informe um e-mail válido.";
    if (!form.rgm) faltando.rgm = "Informe o RGM.";
    else if (!validarRgm(form.rgm)) faltando.rgm = "O RGM deve ter exatamente 11 dígitos.";
    return faltando;
  }

  function pedirSalvar() {
    if (edicao.mostrar(validarEdicao())) return;
    setConfirmandoSalvar(true);
  }

  async function salvar() {
    if (!editando) return;
    try {
      await participanteService.update(editando.id, form);
      toast.success("Participante atualizado.");
      setConfirmandoSalvar(false);
      setEditando(null);
      await carregar();
    } catch (erro) {
      setConfirmandoSalvar(false);
      if (erro instanceof ApiError && erro.code === "DUPLICIDADE_PARTICIPANTE") edicao.mostrar({ email: erro.message, rgm: erro.message });
      else if (!edicao.mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o participante.");
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
    inativacao.limpar();
  }

  async function inativar() {
    if (!inativando) return;
    if (inativacao.mostrar(motivoInativacao.trim() ? {} : { motivoInativacao: "Informe o motivo da inativação." })) return;
    try {
      await participanteService.update(inativando.id, { ativo: false, motivoInativacao: motivoInativacao.trim() });
      toast.success("Aluno inativado. As sessões abertas dele foram encerradas e as inscrições em eventos futuros, canceladas.");
      setInativando(null);
      await carregar();
    } catch (erro) {
      if (!inativacao.mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível inativar o aluno.");
    }
  }

  async function reativar() {
    if (!reativando) return;
    try {
      await participanteService.update(reativando.id, { ativo: true });
      toast.success("Aluno reativado. Ele já pode entrar de novo.");
      setReativando(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível reativar o aluno.");
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
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((participante) => (
              <tr key={participante.id}>
                <td>{participante.nome}</td>
                <td>{participante.email}</td>
                <td>{participante.rgm}</td>
                <td>{participante.ativo === false ? <Badge tone="red">Inativo</Badge> : <Badge tone="green">Ativo</Badge>}</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(participante)}>Editar</button>
                  {participante.ativo === false ? (
                    <button className="btn btn-ghost" onClick={() => setReativando(participante)}>Reativar</button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => abrirInativacao(participante)}>Inativar</button>
                  )}
                  {participante.ativo === false && (
                    <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(participante)}>
                      Excluir
                    </button>
                  )}
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

      {editando && (
        <Modal title="Editar participante" onClose={() => setEditando(null)}>
          <form
            className="form"
            ref={edicao.formRef}
            noValidate
            onChange={edicao.limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              pedirSalvar();
            }}
          >
            <LegendaObrigatorio />
            <Campo nome="nome" rotulo="Nome" obrigatorio erro={edicao.erros.nome}>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
            </Campo>
            <Campo nome="email" rotulo="E-mail" obrigatorio erro={edicao.erros.email} dica="Também é o e-mail de login do aluno.">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
            <Campo nome="rgm" rotulo="RGM" obrigatorio erro={edicao.erros.rgm}>
              <input
                value={form.rgm}
                onChange={(e) => setForm({ ...form, rgm: normalizarRgm(e.target.value) })}
                inputMode="numeric"
                maxLength={11}
              />
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>
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
          message={`Tem certeza que deseja remover "${excluindo.nome}"? A conta, inscrições, feedbacks e tentativas de questionário serão apagados. Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}

      {reativando && (
        <ConfirmDialog
          title="Reativar aluno"
          message={`Reativar o acesso de ${reativando.nome}? Ele volta a entrar no sistema e a se inscrever em eventos.`}
          confirmLabel="Reativar"
          onConfirm={() => void reativar()}
          onCancel={() => setReativando(null)}
        />
      )}

      {inativando && (
        <Modal title="Inativar aluno" onClose={() => setInativando(null)}>
          <form
            className="form"
            ref={inativacao.formRef}
            noValidate
            onChange={inativacao.limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              void inativar();
            }}
          >
            <p style={{ margin: 0 }}>
              {inativando.nome} deixa de entrar no sistema: as sessões abertas são encerradas e as inscrições em eventos que
              ainda não aconteceram são canceladas. Presenças e certificados já emitidos continuam valendo.
            </p>
            <LegendaObrigatorio />
            <Campo
              nome="motivoInativacao"
              rotulo="Motivo da inativação"
              obrigatorio
              erro={inativacao.erros.motivoInativacao}
              dica="Fica só no cadastro, visível para a equipe. O aluno vê apenas que a conta está inativa."
            >
              <textarea value={motivoInativacao} onChange={(e) => setMotivoInativacao(e.target.value)} rows={4} maxLength={500} autoFocus />
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setInativando(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger-solid">
                Inativar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
