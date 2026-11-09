import { useEffect, useState } from "react";
import { DialogoAprovacao, type AcaoAprovacao } from "../../components/aprovacao/DialogoAprovacao";
import { ListaMudancas, ResumoProposta } from "../../components/aprovacao/ResumoProposta";
import { SituacaoAprovacao } from "../../components/aprovacao/SituacaoAprovacao";
import { PainelCheckins } from "../../components/checkin/PainelCheckins";
import { Campo, LegendaObrigatorio, MarcaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { ApiError, aprovacaoService, avisarAprovacoesAlteradas, eventoService, palestranteService, salaService, type AlvoAprovacao } from "../../services";
import type { Evento, Palestrante, PerguntaQuestionario, Sala, SituacaoAprovacao as Situacao } from "../../types";
import { eventoEncerrado, inputLocalParaIso, isoParaInputLocal } from "../../utils/data";
import { situacaoDaJanela } from "../../utils/presenca";
import { ALTERNATIVAS_POR_PERGUNTA, questionarioVazio } from "../../utils/questionario";
import { EventosAluno } from "./EventosAluno";
import { ModalPropostaEvento, mudancasDoEvento } from "./PropostaEvento";

interface FormEvento {
  titulo: string;
  horario: string;
  salaId: string;
  palestranteId: string;
  tema: string;
  // texto no formulario pra campo vazio nao virar 0 sozinho
  cargaHoraria: string;
  questionario: PerguntaQuestionario[];
}

function formVazio(): FormEvento {
  return { titulo: "", horario: "", salaId: "", palestranteId: "", tema: "", cargaHoraria: "", questionario: questionarioVazio() };
}

// chaves de erro do questionario seguem o caminho que o backend devolve (questionario.3.enunciado...)
const chaveEnunciado = (i: number) => `questionario.${i}.enunciado`;
const chaveAlternativa = (i: number, j: number) => `questionario.${i}.alternativas.${j}.texto`;
const chaveCorreta = (i: number) => `questionario.${i}.correta`;

function validarEvento(form: FormEvento): ErrosFormulario {
  const erros: ErrosFormulario = {};
  if (!form.titulo.trim()) erros.titulo = "Informe o título do evento.";
  if (!form.salaId) erros.salaId = "Selecione a sala.";
  if (!form.horario) erros.horario = "Informe a data e o horário.";
  if (!form.palestranteId) erros.palestranteId = "Selecione o palestrante responsável.";
  if (!form.tema.trim()) erros.tema = "Informe o tema do evento.";
  const carga = Number(form.cargaHoraria);
  if (!form.cargaHoraria.trim()) erros.cargaHoraria = "Informe a carga horária.";
  else if (!(carga > 0)) erros.cargaHoraria = "A carga horária deve ser maior que zero.";

  form.questionario.forEach((pergunta, i) => {
    if (!pergunta.enunciado.trim()) erros[chaveEnunciado(i)] = `Escreva o enunciado da pergunta ${i + 1}.`;
    pergunta.alternativas.forEach((alternativa, j) => {
      if (!alternativa.texto.trim()) erros[chaveAlternativa(i, j)] = `Preencha a alternativa ${j + 1}.`;
    });
    if (pergunta.alternativas.filter((a) => a.correta).length !== 1) erros[chaveCorreta(i)] = "Marque qual alternativa é a correta.";
  });
  return erros;
}

// aluno ve a programacao com inscrever/cancelar (EventosAluno.tsx); equipe e professor veem a gestao abaixo
export function EventosPage() {
  const { usuario } = useAuth();
  return usuario?.perfil === "ALUNO" ? <EventosAluno /> : <EventosEquipe />;
}

// crud de eventos com a ocupacao (inscritos/capacidade) de cada evento. A equipe ve todos e aprova ou recusa
// os enviados por professor e as propostas de alteracao; o professor ve so os dele (a API ja filtra), com a
// situacao da aprovacao, reenvia o que foi recusado e acompanha a proposta de alteracao dentro do evento.
// Evento encerrado nao tem mais Editar nem Excluir (a API tambem recusa)
function EventosEquipe() {
  const { usuario } = useAuth();
  const ehProfessor = usuario?.perfil === "PROFESSOR";
  const ehEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";
  const [filtroSituacao, setFiltroSituacao] = useState<"" | Situacao>("");
  const [acaoAprovacao, setAcaoAprovacao] = useState<{ acao: AcaoAprovacao; evento: Evento; alvo?: AlvoAprovacao } | null>(null);
  // proposta de alteracao: corrigir/reenviar (modal proprio) e cancelar (confirmacao)
  const [corrigindoProposta, setCorrigindoProposta] = useState<Evento | null>(null);
  const [cancelandoProposta, setCancelandoProposta] = useState<Evento | null>(null);
  // evento com o painel "Check-ins" aberto (pedidos de check-in dos alunos)
  const [checkinsDe, setCheckinsDe] = useState<Evento | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [busca, setBusca] = useState("");
  // enquanto carrega a tabela diz "Carregando" (e nao "Nenhum evento cadastrado")
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState<FormEvento>(formVazio());
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Evento | null>(null);
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca eventos/salas/palestrantes de uma vez (a contagem de inscritos ja vem em cada evento)
  async function carregar() {
    try {
      const [e, sa, p] = await Promise.all([eventoService.list(), salaService.list(), palestranteService.list()]);
      setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario)));
      setSalas(sa);
      setPalestrantes(p);
    } finally {
      setCarregando(false);
    }
  }

  const nomeDaSala = (evento: Evento) => salas.find((s) => s.id === evento.salaId)?.nome ?? "—";
  const nomeDoPalestrante = (evento: Evento) => palestrantes.find((p) => p.id === evento.palestranteId)?.nome ?? "—";
  // a busca filtra a lista ja carregada: titulo, tema, palestrante ou sala
  const termo = busca.trim().toLowerCase();
  // "Aguardando aprovação" e "Recusados" incluem os eventos aprovados com proposta de alteracao nessa situacao
  const eventosVisiveis = eventos
    .filter((e) => !filtroSituacao || e.situacao === filtroSituacao || (filtroSituacao !== "APROVADO" && e.proposta?.situacao === filtroSituacao))
    .filter((e) => !termo || `${e.titulo} ${e.tema ?? ""} ${nomeDoPalestrante(e)} ${nomeDaSala(e)}`.toLowerCase().includes(termo));
  // professor editando evento ja aprovado: titulo, tema e questionario mudam na hora; sala, horario, carga
  // horaria e palestrante viram uma proposta de alteracao (a API decide). Com uma proposta ja aguardando, ou
  // com o evento ja comecado, esses campos ficam travados aqui
  const aprovadoDoProfessor = ehProfessor && editando?.situacao === "APROVADO";
  const jaComecou = !!editando && new Date(editando.horario).getTime() <= Date.now();
  const comPropostaPendente = editando?.proposta?.situacao === "PENDENTE";
  const travarAgenda = aprovadoDoProfessor && (comPropostaPendente || jaComecou);
  const agendaViraProposta = aprovadoDoProfessor && !travarAgenda;
  // ja ha resposta de aluno: o questionario fica so para leitura (a API tambem recusa a mudanca)
  const questionarioTravado = !!editando?.questionarioTravado;
  // quem cuida da proposta do lado do evento: o professor dono (ou a equipe, num evento que ficou com ela)
  const podeCuidarDaProposta = (evento: Evento) => ehProfessor || (ehEquipe && !evento.criadoPorId);
  // a agenda do formulario mudou em relacao ao evento salvo (pro texto da confirmacao)
  const agendaMudou =
    !!editando &&
    (form.salaId !== editando.salaId ||
      form.palestranteId !== editando.palestranteId ||
      Number(form.cargaHoraria) !== editando.cargaHoraria ||
      (!!form.horario && new Date(inputLocalParaIso(form.horario)).getTime() !== new Date(editando.horario).getTime()));
  // a equipe so usa palestrante aprovado (o evento dela ja nasce aprovado); o professor ve os aprovados e os dele
  const palestrantesDoFormulario = palestrantes.filter(
    (p) => !ehEquipe || p.situacao === undefined || p.situacao === "APROVADO" || p.id === editando?.palestranteId,
  );

  // abre o modal em branco (sala e palestrante escolhidos de proposito, nao pre-selecionados)
  function abrirNovo() {
    setEditando(null);
    setForm(formVazio());
    limpar();
    setModalAberto(true);
  }

  // abre o modal ja preenchido com os dados do evento clicado
  function abrirEdicao(evento: Evento) {
    setEditando(evento);
    setForm({
      titulo: evento.titulo,
      horario: isoParaInputLocal(evento.horario),
      salaId: evento.salaId,
      palestranteId: evento.palestranteId,
      tema: evento.tema ?? "",
      cargaHoraria: String(evento.cargaHoraria ?? ""),
      questionario: evento.questionario ?? questionarioVazio(),
    });
    limpar();
    setModalAberto(true);
  }

  // atualiza o enunciado de uma pergunta especifica
  function atualizarEnunciado(indicePergunta: number, valor: string) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) => (i === indicePergunta ? { ...p, enunciado: valor } : p)),
    });
  }

  // atualiza o texto de uma alternativa especifica
  function atualizarAlternativa(indicePergunta: number, indiceAlternativa: number, valor: string) {
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) =>
        i === indicePergunta
          ? { ...p, alternativas: p.alternativas.map((a, j) => (j === indiceAlternativa ? { ...a, texto: valor } : a)) }
          : p,
      ),
    });
  }

  // marca uma alternativa como correta, as outras 3 da mesma pergunta viram falsas
  function marcarCorreta(indicePergunta: number, indiceAlternativa: number) {
    limpar(chaveCorreta(indicePergunta));
    setForm({
      ...form,
      questionario: form.questionario.map((p, i) =>
        i === indicePergunta
          ? { ...p, alternativas: p.alternativas.map((a, j) => ({ ...a, correta: j === indiceAlternativa })) }
          : p,
      ),
    });
  }

  // valida, e se for edicao pede confirmacao antes de gravar
  function pedirSalvar() {
    if (mostrar(validarEvento(form))) return;
    if (editando) setConfirmandoSalvar(true);
    else void salvar();
  }

  // cria ou atualiza dependendo se ta editando, convertendo o horario do input (fuso local) pra ISO
  async function salvar() {
    const dados = { ...form, cargaHoraria: Number(form.cargaHoraria), horario: inputLocalParaIso(form.horario) };
    try {
      if (editando) {
        // questionario travado nao vai no pedido (o resto do evento continua editavel)
        const { questionario, ...semQuestionario } = dados;
        const resposta = await eventoService.update(editando.id, questionarioTravado ? semQuestionario : { ...semQuestionario, questionario });
        if (resposta.propostaEnviada) {
          toast.success(
            "Alteração enviada para aprovação da equipe. Até lá o evento continua como está (título, tema e questionário já foram salvos).",
          );
          avisarAprovacoesAlteradas();
        } else if (resposta.avisoInscritos && resposta.avisoInscritos.inscritos > 0) {
          toast.success(
            `Evento atualizado. ${resposta.avisoInscritos.avisados} de ${resposta.avisoInscritos.inscritos} inscrito(s) avisado(s) por e-mail.`,
          );
        } else {
          toast.success("Evento atualizado.");
        }
      } else {
        await eventoService.create(dados);
        toast.success(ehProfessor ? "Evento enviado para aprovação da equipe." : "Evento cadastrado.");
        if (ehProfessor) avisarAprovacoesAlteradas();
      }
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (e) {
      setConfirmandoSalvar(false);
      // sala ja ocupada nesse horario por outro evento: a mensagem do backend (com o titulo do outro
      // evento) aparece embaixo do campo de data/horario
      if (e instanceof ApiError && e.code === "CONFLITO_DE_SALA") {
        mostrar({ horario: e.message });
        return;
      }
      // a sala nova nao comporta os inscritos: o aviso vai no campo da sala
      if (e instanceof ApiError && e.code === "SALA_SEM_CAPACIDADE") {
        mostrar({ salaId: e.message });
        return;
      }
      // palestrante ainda nao aprovado, escolhido pela equipe: o aviso vai no campo do palestrante
      if (e instanceof ApiError && e.errors?.some((item) => item.campo === "palestranteId")) {
        mostrarErroDaApi(e);
        return;
      }
      // a regra de "exatamente 1 correta" o backend devolve em questionario.N.alternativas
      const tratou = mostrarErroDaApi(e, (campo) => campo.replace(/^(questionario\.\d+)\.alternativas$/, "$1.correta"));
      if (!tratou) toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar o evento.");
    }
  }

  // o professor desiste da proposta de alteracao (pendente ou recusada)
  async function cancelarProposta() {
    if (!cancelandoProposta) return;
    try {
      await aprovacaoService.cancelarProposta("EVENTO", cancelandoProposta.id);
      toast.success("Proposta de alteração cancelada.");
      avisarAprovacoesAlteradas();
      setCancelandoProposta(null);
      setModalAberto(false);
      await carregar();
    } catch (e) {
      setCancelandoProposta(null);
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar a proposta.");
    }
  }

  // evento com inscricao nao e excluido (o backend responde 409): avisa direto, sem abrir a confirmacao
  function pedirExclusao(evento: Evento) {
    const inscritos = evento.inscritos ?? 0;
    if (inscritos > 0) {
      toast.error(
        `"${evento.titulo}" tem ${inscritos} ${inscritos === 1 ? "inscrição" : "inscrições"}. Cancele as inscrições antes de excluir o evento.`,
      );
      return;
    }
    setExcluindo(evento);
  }

  // so evento sem nenhuma inscricao e excluido; nada mais e apagado em cascata
  async function excluir() {
    if (!excluindo) return;
    try {
      await eventoService.remove(excluindo.id);
      toast.success("Evento removido.");
      setExcluindo(null);
      await carregar();
    } catch (e) {
      setExcluindo(null);
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o evento.");
    }
  }

  return (
    <div>
      <PageHeader
        title={ehProfessor ? "Meus eventos" : "Eventos"}
        actions={
          <button className="btn btn-primary" onClick={abrirNovo} disabled={salas.length === 0 || palestrantes.length === 0}>
            + Novo evento
          </button>
        }
      />
      {ehProfessor && (
        <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Seus eventos ficam aguardando a aprovação da equipe antes de aparecer para os alunos.
        </p>
      )}

      <div className="card table-scroll">
        <div className="filtros-linha">
          <input
            className="search-input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, tema, palestrante ou sala"
            aria-label="Buscar eventos"
          />
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
              <th>Título</th>
              <th>Situação</th>
              <th>Sala</th>
              <th>Data/Horário</th>
              <th>Palestrante</th>
              <th>Tema</th>
              <th>Carga horária</th>
              <th>Inscritos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventosVisiveis.map((evento) => {
              const encerrado = eventoEncerrado(evento);
              return (
                <tr key={evento.id}>
                  <td>{evento.titulo}</td>
                  <td>
                    <SituacaoAprovacao situacao={evento.situacao} motivoRecusa={evento.motivoRecusa} />
                    {evento.proposta && (
                      <ResumoProposta
                        situacao={evento.proposta.situacao}
                        motivoRecusa={evento.proposta.motivoRecusa}
                        mudancas={mudancasDoEvento(evento, salas, palestrantes)}
                      />
                    )}
                  </td>
                  <td>{nomeDaSala(evento)}</td>
                  <td>{evento.horario ? new Date(evento.horario).toLocaleString("pt-BR") : "—"}</td>
                  <td>{nomeDoPalestrante(evento)}</td>
                  <td className="truncate">{evento.tema || "—"}</td>
                  <td>{evento.cargaHoraria ? `${evento.cargaHoraria}h` : "—"}</td>
                  <td>
                    {evento.inscritos ?? 0}/{salas.find((s) => s.id === evento.salaId)?.capacidade ?? "—"}
                  </td>
                  <td className="table-actions">
                    {ehEquipe && evento.situacao === "PENDENTE" && (
                      <>
                        <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "aprovar", evento })}>
                          Aprovar
                        </button>
                        <button className="btn btn-ghost btn-danger" onClick={() => setAcaoAprovacao({ acao: "recusar", evento })}>
                          Recusar
                        </button>
                      </>
                    )}
                    {ehEquipe && evento.proposta?.situacao === "PENDENTE" && (
                      <>
                        <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "aprovar", evento, alvo: "proposta" })}>
                          Aprovar alteração
                        </button>
                        <button
                          className="btn btn-ghost btn-danger"
                          onClick={() => setAcaoAprovacao({ acao: "recusar", evento, alvo: "proposta" })}
                        >
                          Recusar alteração
                        </button>
                      </>
                    )}
                    {podeCuidarDaProposta(evento) && evento.situacao === "RECUSADO" && !encerrado && (
                      <button className="btn btn-primary" onClick={() => setAcaoAprovacao({ acao: "reenviar", evento })}>
                        Reenviar
                      </button>
                    )}
                    {evento.situacao === "APROVADO" && situacaoDaJanela(evento) !== "ANTES" && (
                      <button className="btn btn-ghost" onClick={() => setCheckinsDe(evento)}>
                        Check-ins
                      </button>
                    )}
                    {(evento.criadoPorId || evento.proposta) && (
                      <button className="btn btn-ghost" onClick={() => setAcaoAprovacao({ acao: "historico", evento })}>
                        Histórico
                      </button>
                    )}
                    {encerrado ? (
                      <span className="form-hint" title="Evento encerrado: não pode mais ser editado nem excluído">
                        Encerrado
                      </span>
                    ) : (
                      <>
                        <button className="btn btn-ghost" onClick={() => abrirEdicao(evento)}>
                          Editar
                        </button>
                        <button className="btn btn-ghost btn-danger" onClick={() => pedirExclusao(evento)}>
                          Excluir
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {eventosVisiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-cell">
                  {carregando
                    ? "Carregando…"
                    : eventos.length === 0
                      ? ehProfessor
                        ? "Você ainda não criou nenhum evento."
                        : "Nenhum evento cadastrado."
                      : "Nenhum evento encontrado para a busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {acaoAprovacao && (
        <DialogoAprovacao
          acao={acaoAprovacao.acao}
          tipo="EVENTO"
          item={{ id: acaoAprovacao.evento.id, nome: acaoAprovacao.evento.titulo }}
          alvo={acaoAprovacao.alvo}
          detalhe={
            acaoAprovacao.alvo === "proposta" ? <ListaMudancas mudancas={mudancasDoEvento(acaoAprovacao.evento, salas, palestrantes)} /> : undefined
          }
          onFechar={() => setAcaoAprovacao(null)}
          onConcluido={() => {
            setAcaoAprovacao(null);
            void carregar();
          }}
        />
      )}

      {modalAberto && (
        <Modal title={editando ? "Editar evento" : "Novo evento"} onClose={() => setModalAberto(false)} wide>
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
                  mudancas={mudancasDoEvento(editando, salas, palestrantes)}
                />
                {ehProfessor ? (
                  <div className="proposta-acoes">
                    <button type="button" className="btn btn-ghost" onClick={() => setCorrigindoProposta(editando)}>
                      {editando.proposta.situacao === "RECUSADO" ? "Corrigir e reenviar" : "Corrigir a proposta"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => setCancelandoProposta(editando)}>
                      Cancelar a proposta
                    </button>
                  </div>
                ) : (
                  <p className="form-hint">
                    {editando.proposta.situacao === "PENDENTE"
                      ? "Aprove ou recuse a alteração pela lista de eventos."
                      : "O professor vê o motivo e pode corrigir e reenviar."}
                  </p>
                )}
              </div>
            )}
            {agendaViraProposta && (
              <p className="form-hint">
                Evento já aprovado: título, tema e questionário mudam na hora. Mudanças em sala, data/horário, carga horária ou
                palestrante vão para a aprovação da equipe, e o evento continua como está até lá.
              </p>
            )}
            {travarAgenda && (
              <p className="form-hint">
                {jaComecou
                  ? "O evento já começou: sala, data/horário, carga horária e palestrante não mudam mais."
                  : "Já há uma alteração aguardando aprovação: corrija ou cancele a proposta acima para mudar sala, data/horário, carga horária ou palestrante."}
              </p>
            )}
            <Campo nome="titulo" rotulo="Título" obrigatorio erro={erros.titulo}>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} autoFocus />
            </Campo>
            <div className="field-row">
              <Campo nome="salaId" rotulo="Sala" obrigatorio erro={erros.salaId}>
                <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })} disabled={travarAgenda}>
                  <option value="">Selecione…</option>
                  {salas.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} ({s.capacidade} lugares)
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="horario" rotulo="Data/Horário" obrigatorio erro={erros.horario}>
                <input
                  type="datetime-local"
                  value={form.horario}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })}
                  disabled={travarAgenda}
                />
              </Campo>
            </div>
            <div className="field-row">
              <Campo nome="palestranteId" rotulo="Palestrante" obrigatorio erro={erros.palestranteId}>
                <select
                  value={form.palestranteId}
                  onChange={(e) => setForm({ ...form, palestranteId: e.target.value })}
                  disabled={travarAgenda}
                >
                  <option value="">Selecione…</option>
                  {palestrantesDoFormulario.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.situacao === "PENDENTE" ? " (aguardando aprovação)" : p.situacao === "RECUSADO" ? " (recusado)" : ""}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="tema" rotulo="Tema" obrigatorio erro={erros.tema}>
                <input value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
              </Campo>
            </div>
            <Campo nome="cargaHoraria" rotulo="Carga horária (horas)" obrigatorio erro={erros.cargaHoraria}>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={form.cargaHoraria}
                onChange={(e) => setForm({ ...form, cargaHoraria: e.target.value })}
                disabled={travarAgenda}
              />
            </Campo>

            <div className="field">
              <span>
                Questionário obrigatório (10 perguntas, definidas pelo palestrante)
                <MarcaObrigatorio />
              </span>
              <p className="form-hint" style={{ margin: 0 }}>
                {questionarioTravado
                  ? "Questionário travado: já há respostas de alunos."
                  : "Em cada pergunta, preencha o enunciado e as 4 alternativas e marque a correta."}
              </p>
              <fieldset className="questionario-builder" disabled={questionarioTravado}>
                {form.questionario.map((pergunta, indicePergunta) => {
                  const erroEnunciado = erros[chaveEnunciado(indicePergunta)];
                  const alternativasComErro = pergunta.alternativas
                    .map((_, j) => j)
                    .filter((j) => erros[chaveAlternativa(indicePergunta, j)]);
                  const erroCorreta = erros[chaveCorreta(indicePergunta)];
                  const temErro = Boolean(erroEnunciado || alternativasComErro.length || erroCorreta);
                  return (
                    <div className={"questionario-pergunta" + (temErro ? " grupo-invalido" : "")} key={pergunta.id}>
                      <div className="questionario-pergunta-titulo">Pergunta {indicePergunta + 1} de 10</div>
                      <input
                        name={chaveEnunciado(indicePergunta)}
                        value={pergunta.enunciado}
                        onChange={(e) => atualizarEnunciado(indicePergunta, e.target.value)}
                        placeholder="Enunciado da pergunta"
                        aria-label={`Enunciado da pergunta ${indicePergunta + 1}`}
                        aria-invalid={erroEnunciado ? true : undefined}
                        className={erroEnunciado ? "campo-invalido" : undefined}
                      />
                      {erroEnunciado && <p className="form-error">{erroEnunciado}</p>}
                      {pergunta.alternativas.map((alternativa, indiceAlternativa) => {
                        const erroAlternativa = erros[chaveAlternativa(indicePergunta, indiceAlternativa)];
                        return (
                          <div className="questionario-alternativa" key={indiceAlternativa}>
                            <input
                              type="radio"
                              name={`correta-${pergunta.id}`}
                              checked={alternativa.correta}
                              onChange={() => marcarCorreta(indicePergunta, indiceAlternativa)}
                              aria-label={`Marcar alternativa ${indiceAlternativa + 1} como correta`}
                              aria-invalid={erroCorreta && indiceAlternativa === 0 ? true : undefined}
                            />
                            <input
                              type="text"
                              name={chaveAlternativa(indicePergunta, indiceAlternativa)}
                              value={alternativa.texto}
                              onChange={(e) => atualizarAlternativa(indicePergunta, indiceAlternativa, e.target.value)}
                              placeholder={`Alternativa ${indiceAlternativa + 1}`}
                              aria-invalid={erroAlternativa ? true : undefined}
                              className={erroAlternativa ? "campo-invalido" : undefined}
                            />
                          </div>
                        );
                      })}
                      {alternativasComErro.length > 0 && (
                        <p className="form-error">
                          {alternativasComErro.length === ALTERNATIVAS_POR_PERGUNTA
                            ? "Preencha as 4 alternativas."
                            : `Preencha a(s) alternativa(s) ${alternativasComErro.map((j) => j + 1).join(", ")}.`}
                        </p>
                      )}
                      {erroCorreta && <p className="form-error">{erroCorreta}</p>}
                    </div>
                  );
                })}
              </fieldset>
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

      {confirmandoSalvar && (
        <ConfirmDialog
          title="Confirmar alteração"
          message={
            agendaViraProposta && agendaMudou
              ? `Salvar as alterações do evento "${form.titulo}"? A mudança de sala, data/horário, carga horária ou palestrante vai para aprovação da equipe.`
              : !ehProfessor && editando?.situacao === "APROVADO" && agendaMudou && (editando.inscritos ?? 0) > 0
                ? `Salvar as alterações do evento "${form.titulo}"? Os ${editando.inscritos} inscrito(s) serão avisados por e-mail da mudança.`
                : `Salvar as alterações do evento "${form.titulo}"?`
          }
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {corrigindoProposta && (
        <ModalPropostaEvento
          evento={corrigindoProposta}
          salas={salas}
          palestrantes={palestrantesDoFormulario}
          onFechar={() => setCorrigindoProposta(null)}
          onConcluido={() => {
            setCorrigindoProposta(null);
            setModalAberto(false);
            void carregar();
          }}
        />
      )}

      {cancelandoProposta && (
        <ConfirmDialog
          title="Cancelar a proposta de alteração"
          message={`Tem certeza que deseja cancelar a proposta de alteração de "${cancelandoProposta.titulo}"? O evento continua como está.`}
          confirmLabel="Cancelar a proposta"
          cancelLabel="Voltar"
          tone="danger"
          onConfirm={() => void cancelarProposta()}
          onCancel={() => setCancelandoProposta(null)}
        />
      )}

      {checkinsDe && (
        <Modal title={`Check-ins de ${checkinsDe.titulo}`} onClose={() => setCheckinsDe(null)} wide>
          <PainelCheckins eventoId={checkinsDe.id} />
        </Modal>
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover evento"
          message={`Tem certeza que deseja remover "${excluindo.titulo}"? Essa ação não pode ser desfeita. Eventos com inscrições não podem ser excluídos: cancele as inscrições antes.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
