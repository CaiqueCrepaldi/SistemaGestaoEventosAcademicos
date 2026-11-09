import { useEffect, useState } from "react";
import { DialogoAprovacao, type AcaoAprovacao } from "../../components/aprovacao/DialogoAprovacao";
import { ListaMudancas, ResumoProposta, type Mudanca } from "../../components/aprovacao/ResumoProposta";
import { SituacaoAprovacao } from "../../components/aprovacao/SituacaoAprovacao";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, aprovacaoService, avisarAprovacoesAlteradas, eventoService, palestranteService, type AlvoAprovacao } from "../../services";
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

// o que a proposta muda no palestrante (nome e/ou e-mail)
function mudancasDoPalestrante(p: Palestrante): Mudanca[] {
  if (!p.proposta) return [];
  const mudancas: Mudanca[] = [];
  if (p.proposta.nome !== p.nome) mudancas.push({ rotulo: "Nome", antes: p.nome, depois: p.proposta.nome });
  if (p.proposta.email !== p.email) mudancas.push({ rotulo: "E-mail", antes: p.email ?? "—", depois: p.proposta.email });
  return mudancas;
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
  const [acaoAprovacao, setAcaoAprovacao] = useState<{ acao: AcaoAprovacao; palestrante: Palestrante; alvo?: AlvoAprovacao } | null>(null);
  // resposta opcional ao reenviar uma proposta recusada; cancelar a proposta pede confirmacao
  const [respostaProposta, setRespostaProposta] = useState("");
  const [cancelandoProposta, setCancelandoProposta] = useState<Palestrante | null>(null);
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

  // professor num palestrante aprovado com proposta aberta: o formulario mostra os valores propostos (corrigir
  // a proposta ou reenviar a recusada); sem proposta, os atuais
  function abrirEdicao(palestrante: Palestrante) {
    setEditando(palestrante);
    const proposta = ehProfessor && palestrante.proposta;
    setForm(proposta ? { nome: proposta.nome, email: proposta.email } : { nome: palestrante.nome, email: palestrante.email ?? "" });
    setRespostaProposta("");
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
      if (editando && editandoProposta) {
        await aprovacaoService.editarPropostaPalestrante(editando.id, {
          ...form,
          ...(editando.proposta?.situacao === "RECUSADO" && respostaProposta.trim() ? { resposta: respostaProposta.trim() } : {}),
        });
        toast.success(editando.proposta?.situacao === "RECUSADO" ? "Alteração reenviada para aprovação." : "Proposta de alteração corrigida.");
        avisarAprovacoesAlteradas();
      } else if (editando) {
        const atualizado = await palestranteService.update(editando.id, form);
        if (atualizado.proposta && !editando.proposta) {
          toast.success("Alteração enviada para aprovação da equipe. Até lá o palestrante continua como está.");
          avisarAprovacoesAlteradas();
        } else {
          toast.success("Palestrante atualizado.");
        }
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

  async function cancelarProposta() {
    if (!cancelandoProposta) return;
    try {
      await aprovacaoService.cancelarProposta("PALESTRANTE", cancelandoProposta.id);
      toast.success("Proposta de alteração cancelada.");
      avisarAprovacoesAlteradas();
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar a proposta.");
    } finally {
      setCancelandoProposta(null);
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

  // o professor edita os palestrantes dele (no aprovado, nome/e-mail viram proposta de alteracao para a equipe);
  // a equipe edita direto e exclui qualquer um
  const ehDoProfessor = (p: Palestrante) => ehProfessor && p.criadoPorId === usuario?.id;
  const podeEditar = (p: Palestrante) => ehEquipe || ehDoProfessor(p);
  // o formulario aberto corrige a proposta aberta (pendente ou recusada) do professor
  const editandoProposta = ehProfessor && !!editando?.proposta;
  // "Aguardando aprovação" e "Recusados" incluem os aprovados com proposta nessa situacao
  const visiveis = palestrantes.filter(
    (p) => !filtroSituacao || p.situacao === filtroSituacao || (filtroSituacao !== "APROVADO" && p.proposta?.situacao === filtroSituacao),
  );

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
                  {palestrante.proposta && (
                    <ResumoProposta
                      situacao={palestrante.proposta.situacao}
                      motivoRecusa={palestrante.proposta.motivoRecusa}
                      mudancas={mudancasDoPalestrante(palestrante)}
                    />
                  )}
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
                  {ehEquipe && palestrante.proposta?.situacao === "PENDENTE" && (
                    <>
                      <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "aprovar", palestrante, alvo: "proposta" })}>
                        Aprovar alteração
                      </button>
                      <button
                        className="btn btn-ghost btn-danger"
                        onClick={() => setAcaoAprovacao({ acao: "recusar", palestrante, alvo: "proposta" })}
                      >
                        Recusar alteração
                      </button>
                    </>
                  )}
                  {ehDoProfessor(palestrante) && palestrante.situacao === "RECUSADO" && (
                    <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "reenviar", palestrante })}>
                      Reenviar
                    </button>
                  )}
                  {(palestrante.criadoPorId || palestrante.proposta) && (ehEquipe || ehDoProfessor(palestrante)) && (
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
          alvo={acaoAprovacao.alvo}
          detalhe={
            acaoAprovacao.alvo === "proposta" ? <ListaMudancas mudancas={mudancasDoPalestrante(acaoAprovacao.palestrante)} /> : undefined
          }
          onFechar={() => setAcaoAprovacao(null)}
          onConcluido={() => {
            setAcaoAprovacao(null);
            void carregar();
          }}
        />
      )}

      {modalAberto && (
        <Modal
          title={editandoProposta ? "Proposta de alteração do palestrante" : editando ? "Editar palestrante" : "Novo palestrante"}
          onClose={() => setModalAberto(false)}
        >
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
            {editando?.proposta && (
              <div className="proposta-no-evento">
                <ResumoProposta
                  situacao={editando.proposta.situacao}
                  motivoRecusa={editando.proposta.motivoRecusa}
                  mudancas={mudancasDoPalestrante(editando)}
                />
                {ehProfessor ? (
                  <div className="proposta-acoes">
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => setCancelandoProposta(editando)}>
                      Cancelar a proposta
                    </button>
                  </div>
                ) : (
                  <p className="form-hint">
                    {editando.proposta.situacao === "PENDENTE"
                      ? "Aprove ou recuse a alteração pela lista. Se você editar aqui, a mudança vale na hora."
                      : "O professor vê o motivo e pode corrigir e reenviar."}
                  </p>
                )}
              </div>
            )}
            {ehProfessor && editando?.situacao === "APROVADO" && (
              <p className="form-hint">
                {editandoProposta
                  ? "Os campos abaixo são os valores propostos: corrija e salve. O palestrante continua como está até a equipe aprovar."
                  : "Palestrante já aprovado: a mudança de nome ou e-mail vai para a aprovação da equipe, e ele continua como está até lá."}
              </p>
            )}
            <Campo nome="nome" rotulo="Nome" obrigatorio erro={erros.nome}>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
            </Campo>
            <Campo nome="email" rotulo="E-mail" obrigatorio erro={erros.email}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
            {editandoProposta && editando?.proposta?.situacao === "RECUSADO" && (
              <Campo nome="respostaProposta" rotulo="Resposta para a equipe (opcional)">
                <textarea rows={3} maxLength={1000} value={respostaProposta} onChange={(e) => setRespostaProposta(e.target.value)} />
              </Campo>
            )}
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

      {cancelandoProposta && (
        <ConfirmDialog
          title="Cancelar a proposta de alteração"
          message={`Tem certeza que deseja cancelar a proposta de alteração de "${cancelandoProposta.nome}"? O palestrante continua como está.`}
          confirmLabel="Cancelar a proposta"
          cancelLabel="Voltar"
          tone="danger"
          onConfirm={() => void cancelarProposta()}
          onCancel={() => setCancelandoProposta(null)}
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
