import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Paginacao } from "../../components/ui/Paginacao";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import {
  ApiError,
  checkinService,
  eventoService,
  inscricaoGestaoService,
  inscricaoService,
  salaService,
  type InscricaoGestao,
} from "../../services";
import type { Evento, Pagina, Participante, Sala, StatusPresenca } from "../../types";
import { corPresenca, rotuloPresenca } from "../../utils/presenca";

const FILTROS_VAZIOS = { eventoId: "", status: "" as StatusPresenca | "", busca: "" };

// inscricoes da equipe: lista paginada e filtrada no servidor (evento, presenca e aluno por nome,
// e-mail ou RGM), inscricao manual com busca de aluno no servidor e cancelamento
export function InscricoesPage() {
  const { usuario } = useAuth();
  const [pagina, setPagina] = useState<Pagina<InscricaoGestao> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [page, setPage] = useState(1);
  // muda a cada gravacao pra recarregar a pagina atual
  const [versao, setVersao] = useState(0);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [buscaParticipante, setBuscaParticipante] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<Participante[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [participanteSelecionado, setParticipanteSelecionado] = useState<Participante | null>(null);
  const [eventoId, setEventoId] = useState("");
  const [excluindo, setExcluindo] = useState<InscricaoGestao | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  // eventos em que quem esta logado pode inscrever: so os aprovados e, para o professor, so os dele (a API recusa os
  // outros com 403)
  const eventosParaInscrever = eventos.filter(
    (e) =>
      (!e.situacao || e.situacao === "APROVADO") && !e.canceladoEm && (usuario?.perfil !== "PROFESSOR" || e.criadoPorId === usuario.id),
  );

  // eventos (com a contagem de inscritos) e salas: pro filtro, pro modal e pra mostrar as vagas
  async function carregarEventos() {
    const [e, sa] = await Promise.all([eventoService.list(), salaService.list()]);
    setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario)));
    setSalas(sa);
  }

  useEffect(() => {
    void carregarEventos();
  }, []);

  // pagina atual com os filtros; a busca por texto espera 300 ms sem digitar pra nao consultar a cada tecla
  useEffect(() => {
    let descartar = false;
    setCarregando(true);
    const espera = setTimeout(() => {
      inscricaoGestaoService
        .listar({ ...filtros, page })
        .then((resposta) => {
          if (descartar) return;
          setPagina(resposta);
          // filtro novo pode ter deixado a pagina atual alem do fim: volta pra ultima que existe
          if (resposta.page > resposta.totalPages) setPage(resposta.totalPages);
        })
        .catch((e) => {
          if (!descartar) toast.error(e instanceof Error ? e.message : "Não foi possível carregar as inscrições.");
        })
        .finally(() => {
          if (!descartar) setCarregando(false);
        });
    }, filtros.busca ? 300 : 0);
    return () => {
      descartar = true;
      clearTimeout(espera);
    };
  }, [filtros, page, versao]);

  // busca de aluno no modal, no servidor, enquanto se digita
  useEffect(() => {
    const termo = buscaParticipante.trim();
    if (!modalAberto || participanteSelecionado || !termo) {
      setResultadosBusca([]);
      return;
    }
    let descartar = false;
    setBuscando(true);
    const espera = setTimeout(() => {
      checkinService
        .listarAlunos(termo)
        .then((lista) => {
          if (!descartar) setResultadosBusca(lista);
        })
        .catch(() => {
          if (!descartar) setResultadosBusca([]);
        })
        .finally(() => {
          if (!descartar) setBuscando(false);
        });
    }, 300);
    return () => {
      descartar = true;
      clearTimeout(espera);
    };
  }, [buscaParticipante, modalAberto, participanteSelecionado]);

  // mudar qualquer filtro volta pra primeira pagina
  function mudarFiltro(parcial: Partial<typeof FILTROS_VAZIOS>) {
    setFiltros((atual) => ({ ...atual, ...parcial }));
    setPage(1);
  }

  // abre o modal de nova inscricao sem evento escolhido (a pessoa escolhe de proposito)
  function abrirNova() {
    setBuscaParticipante("");
    setParticipanteSelecionado(null);
    setEventoId("");
    limpar();
    setModalAberto(true);
  }

  // capacidade da sala menos quantas inscricoes o evento ja tem (a contagem vem pronta da API)
  function vagasDisponiveis(evento: Evento | undefined): number | null {
    if (!evento) return null;
    const sala = salas.find((s) => s.id === evento.salaId);
    if (!sala) return null;
    return sala.capacidade - (evento.inscritos ?? 0);
  }

  // duplicidade e lotacao o backend confere (409) e a mensagem aparece no campo do evento
  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!participanteSelecionado) faltando.participanteId = "Busque e selecione o aluno.";
    else if (participanteSelecionado.ativo === false) faltando.participanteId = "Aluno inativo: não é possível inscrevê-lo em eventos.";
    if (!eventoId) faltando.eventoId = "Selecione o evento.";
    else {
      const vagas = vagasDisponiveis(eventos.find((e) => e.id === eventoId));
      if (vagas !== null && vagas <= 0) faltando.eventoId = "Não há vagas disponíveis para este evento.";
    }
    return faltando;
  }

  // valida selecao/vaga e cria a inscricao
  async function salvar() {
    if (mostrar(validar())) return;
    try {
      await inscricaoService.create({
        participanteId: participanteSelecionado!.id,
        eventoId,
        statusPresenca: "PENDENTE",
        dataCheckin: null,
        usuarioId: null,
      });
      toast.success("Inscrição registrada.");
      setModalAberto(false);
      setVersao((v) => v + 1);
      void carregarEventos();
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "PARTICIPANTE_INATIVO") mostrar({ participanteId: erro.message });
      else if (erro instanceof ApiError && (erro.code === "JA_INSCRITO" || erro.code === "EVENTO_LOTADO")) mostrar({ eventoId: erro.message });
      else if (!mostrarErroDaApi(erro)) toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar a inscrição.");
    }
  }

  // cancela a inscricao marcada — mesma regra do cancelamento pelo aluno (presenca pendente, evento
  // que nao comecou, questionario nao respondido); o backend avisa o aluno por e-mail
  async function excluir() {
    if (!excluindo) return;
    try {
      await inscricaoService.remove(excluindo.id);
      toast.success("Inscrição cancelada. O aluno será avisado por e-mail.");
      setVersao((v) => v + 1);
      void carregarEventos();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar a inscrição.");
    } finally {
      setExcluindo(null);
    }
  }

  const eventoSelecionado = eventos.find((e) => e.id === eventoId);
  const vagas = vagasDisponiveis(eventoSelecionado);
  const itens = pagina?.itens ?? [];
  const filtrosAtivos = Boolean(filtros.eventoId || filtros.status || filtros.busca.trim());

  return (
    <div>
      <PageHeader
        title="Inscrições"
        actions={
          <button className="btn btn-primary" onClick={abrirNova} disabled={eventos.length === 0}>
            + Nova inscrição
          </button>
        }
      />

      <div className="card">
        <div className="field-row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <label className="field" style={{ minWidth: 220 }}>
            <span>Evento</span>
            <select value={filtros.eventoId} onChange={(e) => mudarFiltro({ eventoId: e.target.value })}>
              <option value="">Todos os eventos</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Presença</span>
            <select value={filtros.status} onChange={(e) => mudarFiltro({ status: e.target.value as StatusPresenca | "" })}>
              <option value="">Todas</option>
              <option value="PENDENTE">Pendente</option>
              <option value="SOLICITADO">Check-in pedido</option>
              <option value="PRESENTE">Presente</option>
              <option value="RECUSADO">Recusado</option>
              <option value="AUSENTE">Ausente</option>
            </select>
          </label>
          <label className="field" style={{ minWidth: 240 }}>
            <span>Aluno</span>
            <input
              value={filtros.busca}
              onChange={(e) => mudarFiltro({ busca: e.target.value })}
              placeholder="Nome, e-mail ou RGM"
              aria-label="Buscar aluno"
            />
          </label>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Evento</th>
              <th>Status</th>
              <th>Check-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((inscricao) => (
              <tr key={inscricao.id}>
                <td>
                  {inscricao.participanteNome || "—"} {!inscricao.participanteAtivo && <Badge tone="red">Inativo</Badge>}
                </td>
                <td>
                  {inscricao.eventoTitulo} {inscricao.eventoCancelado && <Badge tone="red">Evento cancelado</Badge>}
                </td>
                <td>
                  <Badge tone={corPresenca(inscricao.statusPresenca)}>{rotuloPresenca(inscricao.statusPresenca)}</Badge>
                </td>
                <td>
                  {inscricao.checkinSolicitadoEm ? `Pedido: ${new Date(inscricao.checkinSolicitadoEm).toLocaleString("pt-BR")}` : "—"}
                  {inscricao.dataCheckin && (
                    <div className="form-hint">Decidido: {new Date(inscricao.dataCheckin).toLocaleString("pt-BR")}</div>
                  )}
                </td>
                <td className="table-actions">
                  {!inscricao.eventoCancelado && (
                    <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(inscricao)}>
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  {carregando ? "Carregando…" : filtrosAtivos ? "Nenhuma inscrição encontrada com esses filtros." : "Nenhuma inscrição registrada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pagina && (
          <Paginacao
            page={page}
            pageSize={pagina.pageSize}
            total={pagina.total}
            totalPages={pagina.totalPages}
            carregando={carregando}
            singular="inscrição"
            plural="inscrições"
            onMudarPagina={setPage}
          />
        )}
      </div>

      {modalAberto && (
        <Modal title="Nova inscrição" onClose={() => setModalAberto(false)}>
          <form
            className="form"
            ref={formRef}
            noValidate
            onChange={limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <LegendaObrigatorio />
            <Campo
              nome="participanteId"
              rotulo="Aluno (busque por nome, e-mail ou RGM)"
              obrigatorio
              erro={erros.participanteId}
            >
              <input
                className="search-input"
                style={{ marginBottom: 0 }}
                value={participanteSelecionado ? `${participanteSelecionado.nome} — ${participanteSelecionado.rgm}` : buscaParticipante}
                onChange={(e) => {
                  setParticipanteSelecionado(null);
                  setBuscaParticipante(e.target.value);
                }}
                placeholder="Nome, e-mail ou RGM…"
                autoComplete="off"
                autoFocus
              />
            </Campo>
            {!participanteSelecionado && resultadosBusca.length > 0 && (
              <ul className="simple-list">
                {resultadosBusca.map((p) => (
                  <li
                    key={p.id}
                    className="simple-list-item clickable"
                    onClick={() => {
                      setParticipanteSelecionado(p);
                      setBuscaParticipante("");
                      limpar("participanteId");
                    }}
                  >
                    <div className="simple-list-item-row">
                      <div className="simple-list-title">{p.nome}</div>
                      {p.ativo === false && <Badge tone="red">Inativo</Badge>}
                    </div>
                    <div className="simple-list-sub">
                      {p.email} · RGM {p.rgm}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!participanteSelecionado && buscaParticipante.trim() && !buscando && resultadosBusca.length === 0 && (
              <p className="form-hint">Nenhum aluno encontrado.</p>
            )}
            <Campo
              nome="eventoId"
              rotulo="Evento"
              obrigatorio
              erro={erros.eventoId}
              dica={vagas !== null ? (vagas > 0 ? `${vagas} vaga(s) disponível(is) neste evento.` : "Evento sem vagas disponíveis.") : undefined}
            >
              <select value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
                <option value="">Selecione…</option>
                {eventosParaInscrever.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Inscrever
              </button>
            </div>
          </form>
        </Modal>
      )}

      {excluindo && (
        <ConfirmDialog
          title="Cancelar inscrição"
          message="Cancelar esta inscrição? O aluno será avisado por e-mail. Só é possível cancelar inscrições sem pedido de check-in, em eventos que ainda não começaram."
          confirmLabel="Cancelar inscrição"
          cancelLabel="Voltar"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
