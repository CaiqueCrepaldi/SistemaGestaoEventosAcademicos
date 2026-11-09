import { useEffect, useState } from "react";
import { DialogoAprovacao, type AcaoAprovacao } from "../../components/aprovacao/DialogoAprovacao";
import { SituacaoAprovacao } from "../../components/aprovacao/SituacaoAprovacao";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, avisarAprovacoesAlteradas, eventoService, palestranteService } from "../../services";
import type { Evento, Palestrante, SituacaoAprovacao as Situacao } from "../../types";
import { validarEmail, validarNome } from "../../utils/validacao";

const VAZIO = { nome: "", email: "" };
// quantas proximas palestras cabem no card do aluno antes de mandar pra tela Eventos
const MAX_EVENTOS_NO_CARD = 3;

const PREPOSICOES = new Set(["de", "da", "do", "das", "dos", "e"]);

// "Maria da Silva" -> "MS"; ignora titulos abreviados ("Dr.", "Profa.") e preposicoes
function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => !parte.endsWith(".") && !PREPOSICOES.has(parte.toLowerCase()));
  const usadas = partes.length > 0 ? partes : nome.trim().split(/\s+/);
  const primeira = usadas[0]?.[0] ?? "";
  const ultima = usadas.length > 1 ? usadas[usadas.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PalestrantesPage() {
  const { usuario } = useAuth();
  const ehAluno = usuario?.perfil === "ALUNO";
  const ehProfessor = usuario?.perfil === "PROFESSOR";
  const ehEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";
  const [filtroSituacao, setFiltroSituacao] = useState<"" | Situacao>("");
  const [acaoAprovacao, setAcaoAprovacao] = useState<{ acao: AcaoAprovacao; palestrante: Palestrante } | null>(null);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  // enquanto carrega a lista diz "Carregando" (e nao "Nenhum palestrante cadastrado")
  const [carregando, setCarregando] = useState(true);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Palestrante | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Palestrante | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
    // eventos so servem pros cards do aluno (proximas palestras de cada palestrante)
    if (ehAluno) void eventoService.list().then(setEventos);
  }, [ehAluno]);

  // busca a lista atualizada de palestrantes
  async function carregar() {
    try {
      setPalestrantes(await palestranteService.list());
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    limpar();
    setModalAberto(true);
  }

  function abrirEdicao(palestrante: Palestrante) {
    setEditando(palestrante);
    setForm({ nome: palestrante.nome, email: palestrante.email ?? "" });
    limpar();
    setModalAberto(true);
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.nome.trim()) faltando.nome = "Informe o nome do palestrante.";
    else if (!validarNome(form.nome)) faltando.nome = "O nome deve conter apenas letras.";
    if (!form.email.trim()) faltando.email = "Informe o e-mail.";
    else if (!validarEmail(form.email)) faltando.email = "Informe um e-mail válido.";
    return faltando;
  }

  function pedirSalvar() {
    if (mostrar(validar())) return;
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
        toast.success(ehProfessor ? "Palestrante enviado para aprovação da equipe." : "Palestrante cadastrado.");
        if (ehProfessor) avisarAprovacoesAlteradas();
      }
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      setConfirmandoSalvar(false);
      if (erro instanceof ApiError && erro.code === "EMAIL_DUPLICADO") mostrar({ email: erro.message });
      else if (!mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o palestrante.");
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

  // ALUNO ve cards so com nome e proximas palestras — o backend nem manda e-mail pra esse perfil
  if (ehAluno) {
    const agora = new Date().toISOString();
    return (
      <div>
        <PageHeader title="Palestrantes" />
        {palestrantes.length === 0 ? (
          <div className="card">
            <p className="empty-cell">{carregando ? "Carregando palestrantes…" : "Nenhum palestrante cadastrado."}</p>
          </div>
        ) : (
          <div className="palestrantes-grid">
            {palestrantes.map((palestrante) => {
              const proximas = eventos
                .filter((evento) => evento.palestranteId === palestrante.id && evento.horario >= agora)
                .sort((a, b) => a.horario.localeCompare(b.horario));
              return (
                <article key={palestrante.id} className="palestrante-card">
                  <div className="palestrante-card-topo">
                    <span className="avatar-iniciais" aria-hidden="true">
                      {iniciais(palestrante.nome)}
                    </span>
                    <div>
                      <h2 className="palestrante-nome">{palestrante.nome}</h2>
                      <p className="palestrante-resumo">
                        {proximas.length === 0
                          ? "Palestrante"
                          : `${proximas.length} ${proximas.length === 1 ? "palestra agendada" : "palestras agendadas"}`}
                      </p>
                    </div>
                  </div>
                  {proximas.length === 0 ? (
                    <p className="palestrante-sem-eventos">Nenhuma palestra agendada no momento.</p>
                  ) : (
                    <ul className="palestrante-eventos">
                      {proximas.slice(0, MAX_EVENTOS_NO_CARD).map((evento) => (
                        <li key={evento.id}>
                          <div className="palestrante-evento-titulo">{evento.titulo}</div>
                          <div className="palestrante-evento-data">{formatarDataHora(evento.horario)}</div>
                        </li>
                      ))}
                      {proximas.length > MAX_EVENTOS_NO_CARD && (
                        <li className="palestrante-resumo">
                          + {proximas.length - MAX_EVENTOS_NO_CARD} em Eventos
                        </li>
                      )}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // o professor so edita os palestrantes dele enquanto nao estao aprovados; a equipe edita e exclui qualquer um
  const ehDoProfessor = (p: Palestrante) => ehProfessor && p.criadoPorId === usuario?.id;
  const podeEditar = (p: Palestrante) => ehEquipe || (ehDoProfessor(p) && p.situacao !== "APROVADO");
  const visiveis = palestrantes.filter((p) => !filtroSituacao || p.situacao === filtroSituacao);

  return (
    <div>
      <PageHeader title="Palestrantes" actions={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo palestrante</button>} />
      {ehProfessor && (
        <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          O palestrante que você cadastrar fica aguardando a aprovação da equipe; enquanto isso, você já pode usá-lo nos seus
          eventos.
        </p>
      )}

      <div className="card table-scroll">
        <div className="filtros-linha">
          <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value as "" | Situacao)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            <option value="PENDENTE">Aguardando aprovação</option>
            <option value="RECUSADO">Recusados</option>
            <option value="APROVADO">Aprovados</option>
          </select>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((palestrante) => (
              <tr key={palestrante.id}>
                <td>{palestrante.nome}</td>
                <td>{palestrante.email ?? "—"}</td>
                <td>
                  <SituacaoAprovacao situacao={palestrante.situacao} motivoRecusa={palestrante.motivoRecusa} />
                </td>
                <td className="table-actions">
                  {ehEquipe && palestrante.situacao === "PENDENTE" && (
                    <>
                      <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "aprovar", palestrante })}>
                        Aprovar
                      </button>
                      <button className="btn btn-ghost btn-danger" onClick={() => setAcaoAprovacao({ acao: "recusar", palestrante })}>
                        Recusar
                      </button>
                    </>
                  )}
                  {ehDoProfessor(palestrante) && palestrante.situacao === "RECUSADO" && (
                    <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "reenviar", palestrante })}>
                      Reenviar
                    </button>
                  )}
                  {palestrante.criadoPorId && (ehEquipe || ehDoProfessor(palestrante)) && (
                    <button className="btn btn-ghost" onClick={() => setAcaoAprovacao({ acao: "historico", palestrante })}>
                      Histórico
                    </button>
                  )}
                  {podeEditar(palestrante) && (
                    <button className="btn btn-ghost" onClick={() => abrirEdicao(palestrante)}>Editar</button>
                  )}
                  {ehEquipe && (
                    <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(palestrante)}>Excluir</button>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-cell">
                  {carregando ? "Carregando…" : palestrantes.length === 0 ? "Nenhum palestrante cadastrado." : "Nenhum palestrante nesta situação."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {acaoAprovacao && (
        <DialogoAprovacao
          acao={acaoAprovacao.acao}
          tipo="PALESTRANTE"
          item={{ id: acaoAprovacao.palestrante.id, nome: acaoAprovacao.palestrante.nome }}
          onFechar={() => setAcaoAprovacao(null)}
          onConcluido={() => {
            setAcaoAprovacao(null);
            void carregar();
          }}
        />
      )}

      {modalAberto && (
        <Modal title={editando ? "Editar palestrante" : "Novo palestrante"} onClose={() => setModalAberto(false)}>
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
            <Campo nome="email" rotulo="E-mail" obrigatorio erro={erros.email}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
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
