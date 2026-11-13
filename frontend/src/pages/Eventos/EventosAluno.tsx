import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError, checkinService, eventoService, inscricaoAlunoService, inscricaoService, palestranteService, salaService } from "../../services";
import type { Evento, Inscricao, Palestrante, Sala, StatusPresenca } from "../../types";
import { dataHora, janelaDoCheckin, rotuloPresencaParaAluno, situacaoDaJanela } from "../../utils/presenca";
import { rotuloSala } from "../../utils/salas";

const COR_DO_CHECKIN: Partial<Record<StatusPresenca, string>> = {
  SOLICITADO: "checkin-aguardando",
  PRESENTE: "checkin-confirmado",
  RECUSADO: "checkin-recusado",
  AUSENTE: "checkin-recusado",
};

// as tres visoes da tela (selecao unica): Abertas e a padrao
type Opcao = "INSCRITAS" | "ABERTAS" | "TODAS";
const OPCOES: { valor: Opcao; rotulo: string }[] = [
  { valor: "INSCRITAS", rotulo: "Inscritas" },
  { valor: "ABERTAS", rotulo: "Abertas" },
  { valor: "TODAS", rotulo: "Todas" },
];
const LISTA_VAZIA: Record<Opcao, string> = {
  INSCRITAS: "Você ainda não se inscreveu em nenhum evento. Veja os eventos com inscrição aberta em \"Abertas\".",
  ABERTAS: "Nenhum evento com inscrição aberta no momento. Volte mais tarde ou veja todos os eventos em \"Todas\".",
  TODAS: "Nenhum evento publicado ainda.",
};

const HORA_MS = 60 * 60 * 1000;

// busca sem diferenciar maiusculas nem acentos ("Gestao" acha "Gestão")
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function hora(data: Date): string {
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// tela Eventos do aluno: tres visoes (Inscritas, Abertas e Todas) com a busca pelo nome da palestra, e as acoes de
// inscrever, cancelar e pedir o check-in em cada cartao. As regras (vagas, horario, janela do check-in) valem na API;
// a tela so mostra a situacao
export function EventosAluno() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  // enquanto carrega, a tela diz "Carregando" (e nao "Nenhum evento", que parece erro)
  const [carregando, setCarregando] = useState(true);
  const [opcao, setOpcao] = useState<Opcao>("ABERTAS");
  const [busca, setBusca] = useState("");
  const [avisoPorEvento, setAvisoPorEvento] = useState<Record<string, string>>({});
  // recusa da inscricao (ex.: outro evento no mesmo horario): aparece em vermelho logo abaixo do botao
  const [erroPorEvento, setErroPorEvento] = useState<Record<string, string>>({});
  // evento cuja inscricao o aluno esta cancelando (aguardando a confirmacao)
  const [cancelandoInscricao, setCancelandoInscricao] = useState<Evento | null>(null);
  // evento em que o aluno esta pedindo o check-in (aguardando a confirmacao "estou no local")
  const [pedindoCheckin, setPedindoCheckin] = useState<Evento | null>(null);

  useEffect(() => {
    // o backend ja devolve so os eventos aprovados e so as inscricoes do proprio aluno
    void Promise.all([eventoService.list(), salaService.list(), palestranteService.list(), inscricaoService.list()])
      .then(([e, s, p, i]) => {
        setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario)));
        setSalas(s);
        setPalestrantes(p);
        setInscricoes(i);
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível carregar os eventos."))
      .finally(() => setCarregando(false));
  }, []);

  // soma (ou tira) uma vaga ocupada na contagem do evento, sem recarregar a lista inteira
  function ajustarInscritos(eventoId: string, delta: number) {
    setEventos((prev) => prev.map((e) => (e.id === eventoId ? { ...e, inscritos: Math.max(0, (e.inscritos ?? 0) + delta) } : e)));
  }

  // o backend cria a inscricao e ja manda o e-mail de confirmacao na mesma chamada
  async function inscreverSe(evento: Evento) {
    if (!usuario?.participanteId) {
      toast.error("Disponível apenas para contas de aluno.");
      return;
    }
    setErroPorEvento((prev) => ({ ...prev, [evento.id]: "" }));
    try {
      const { emailConfirmacaoEnviado, ...nova } = await inscricaoAlunoService.inscrever(usuario.participanteId, evento.id);
      setInscricoes((prev) => [...prev, nova]);
      ajustarInscritos(evento.id, 1);
      const mensagem = emailConfirmacaoEnviado
        ? `Inscrição confirmada. E-mail de confirmação enviado para ${usuario.emailLogin}.`
        : "Inscrição confirmada, mas não foi possível enviar o e-mail de confirmação.";
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
      toast.success(mensagem);
    } catch (e) {
      const mensagem = e instanceof ApiError ? e.message : "Não foi possível concluir a inscrição.";
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: "" }));
      setErroPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
      toast.error(mensagem);
    }
  }

  // aluno cancela a propria inscricao (o backend confere: presenca pendente e evento que nao comecou);
  // a vaga volta e ele pode se inscrever de novo enquanto houver vaga
  async function cancelarInscricao() {
    if (!cancelandoInscricao) return;
    const evento = cancelandoInscricao;
    try {
      await inscricaoAlunoService.cancelar(evento.id);
      setInscricoes((prev) => prev.filter((i) => !(i.eventoId === evento.id && i.participanteId === usuario?.participanteId)));
      ajustarInscritos(evento.id, -1);
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: "Inscrição cancelada." }));
      toast.success("Inscrição cancelada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível cancelar a inscrição.");
    } finally {
      setCancelandoInscricao(null);
    }
  }

  // o aluno pede o check-in (a API confere janela, inscricao e situacao); quem aprova e o professor do
  // evento ou a equipe. Nao sai e-mail
  async function fazerCheckin() {
    if (!pedindoCheckin) return;
    const evento = pedindoCheckin;
    try {
      const atualizada = await checkinService.solicitar(evento.id);
      setInscricoes((prev) => prev.map((i) => (i.id === atualizada.id ? { ...i, ...atualizada } : i)));
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: "Check-in enviado. Aguarde a aprovação." }));
      toast.success("Check-in enviado. Aguarde a aprovação.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível fazer o check-in.");
    } finally {
      setPedindoCheckin(null);
    }
  }

  const agora = Date.now();
  const inicioDe = (evento: Evento) => new Date(evento.horario).getTime();
  const fimDe = (evento: Evento) => inicioDe(evento) + evento.cargaHoraria * HORA_MS;
  const jaComecou = (evento: Evento) => inicioDe(evento) <= agora;
  const jaTerminou = (evento: Evento) => fimDe(evento) <= agora;
  const salaDe = (evento: Evento) => salas.find((s) => s.id === evento.salaId);
  const nomeDoPalestrante = (evento: Evento) => palestrantes.find((p) => p.id === evento.palestranteId)?.nome ?? "—";
  const minhaInscricaoEm = (evento: Evento) =>
    inscricoes.find((i) => i.participanteId === usuario?.participanteId && i.eventoId === evento.id);
  const vagasRestantes = (evento: Evento) => {
    const capacidade = salaDe(evento)?.capacidade;
    return capacidade === undefined ? null : Math.max(0, capacidade - (evento.inscritos ?? 0));
  };

  // os proximos primeiro (do mais cedo pro mais tarde) e depois os ja realizados (do mais recente pro mais antigo)
  const proximosEDepoisRealizados = (lista: Evento[]) => [
    ...lista.filter((e) => !jaTerminou(e)),
    ...lista.filter(jaTerminou).reverse(),
  ];
  const porOpcao: Record<Opcao, Evento[]> = {
    INSCRITAS: proximosEDepoisRealizados(eventos.filter((e) => Boolean(minhaInscricaoEm(e)))),
    // inclusive os lotados (com a etiqueta "Sem vagas"); o cancelado nao esta aberto (fica em Inscritas e Todas)
    ABERTAS: eventos.filter((e) => !jaComecou(e) && !e.canceladoEm),
    TODAS: proximosEDepoisRealizados(eventos),
  };
  const termo = normalizar(busca);
  const visiveis = termo ? porOpcao[opcao].filter((e) => normalizar(e.titulo).includes(termo)) : porOpcao[opcao];
  const rotuloDaOpcao = OPCOES.find((o) => o.valor === opcao)!.rotulo;

  // etiqueta de situacao do cartao (Inscrito, Check-in aberto, Sem vagas ou Encerrado); evento aberto com vaga, sem
  // inscricao do aluno, fica sem etiqueta
  function situacaoDoEvento(evento: Evento, inscricao: Inscricao | undefined): { texto: string; tom: "green" | "orange" | "red" | "neutral" } | null {
    if (evento.canceladoEm) return { texto: "Cancelado", tom: "red" };
    if (inscricao) {
      if (inscricao.statusPresenca === "PENDENTE" && situacaoDaJanela(evento, agora) === "ABERTA") return { texto: "Check-in aberto", tom: "orange" };
      if (jaTerminou(evento) && inscricao.statusPresenca === "PENDENTE") return { texto: "Encerrado", tom: "neutral" };
      return { texto: "Inscrito", tom: "green" };
    }
    if (jaComecou(evento)) return { texto: "Encerrado", tom: "neutral" };
    if (vagasRestantes(evento) === 0) return { texto: "Sem vagas", tom: "red" };
    return null;
  }

  function cartaoDoEvento(evento: Evento) {
    const sala = salaDe(evento);
    const minhaInscricao = minhaInscricaoEm(evento);
    const jaInscrito = Boolean(minhaInscricao);
    const comecou = jaComecou(evento);
    const restantes = vagasRestantes(evento);
    const lotado = restantes === 0;
    // mesma regra do backend: depois que o evento comeca, o aluno nao se inscreve nem cancela
    const podeCancelar = minhaInscricao?.statusPresenca === "PENDENTE" && !comecou;
    // check-in: o botao so aparece com a janela aberta e a inscricao ainda sem pedido
    const janela = situacaoDaJanela(evento, agora);
    const podeFazerCheckin = minhaInscricao?.statusPresenca === "PENDENTE" && janela === "ABERTA";
    const situacaoCheckin = minhaInscricao && minhaInscricao.statusPresenca !== "PENDENTE" ? minhaInscricao.statusPresenca : null;
    const situacao = situacaoDoEvento(evento, minhaInscricao);
    const inicio = new Date(evento.horario);
    const fim = new Date(fimDe(evento));
    const rotuloBotao = jaInscrito ? "Inscrito" : comecou ? "Encerrado" : lotado ? "Sem vagas" : "Inscrever-se";
    // cancelado pela equipe: so a etiqueta e o motivo, sem nenhum botao de acao (a API recusa tudo)
    const cancelado = Boolean(evento.canceladoEm);
    return (
      <li
        key={evento.id}
        className={"evento-cartao" + (jaTerminou(evento) || cancelado ? " evento-cartao-passado" : "") + (cancelado ? " evento-cartao-cancelado" : "")}
      >
        <div className="evento-cartao-data" aria-hidden="true">
          <span className="evento-cartao-dia">{inicio.getDate()}</span>
          <span className="evento-cartao-mes">{inicio.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
          <span className="evento-cartao-semana">{inicio.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
        </div>
        <div className="evento-cartao-corpo">
          <div className="evento-cartao-topo">
            <h3 className="evento-cartao-titulo">{evento.titulo}</h3>
            {situacao && <Badge tone={situacao.tom}>{situacao.texto}</Badge>}
          </div>
          {evento.tema && <p className="evento-cartao-tema">{evento.tema}</p>}
          <dl className="evento-cartao-dados">
            <div>
              <dt>Quando</dt>
              <dd>
                {inicio.toLocaleDateString("pt-BR")}, das {hora(inicio)} às {hora(fim)}
              </dd>
            </div>
            <div>
              <dt>Sala</dt>
              <dd>{rotuloSala(sala)}</dd>
            </div>
            <div>
              <dt>Palestrante</dt>
              <dd>{nomeDoPalestrante(evento)}</dd>
            </div>
            <div>
              <dt>Vagas</dt>
              <dd>{restantes === null ? "—" : lotado ? "Nenhuma vaga restante" : `${restantes} de ${sala?.capacidade} restantes`}</dd>
            </div>
          </dl>
          {cancelado && (
            <p className="evento-cartao-aviso evento-cancelado-motivo">
              Este evento foi cancelado. Motivo: {evento.motivoCancelamento}
              {jaInscrito ? " Sua inscrição foi encerrada." : ""}
            </p>
          )}
          {situacaoCheckin && !cancelado && (
            <p className={"checkin-situacao " + (COR_DO_CHECKIN[situacaoCheckin] ?? "")}>{rotuloPresencaParaAluno(situacaoCheckin)}</p>
          )}
          {!cancelado && minhaInscricao?.statusPresenca === "PENDENTE" && janela === "ANTES" && (
            <p className="form-hint evento-cartao-aviso">O check-in abre em {dataHora(janelaDoCheckin(evento).abre)} (1 hora antes do início).</p>
          )}
          {avisoPorEvento[evento.id] && <p className="form-hint evento-cartao-aviso">{avisoPorEvento[evento.id]}</p>}
          {!cancelado && (
          <div className="evento-cartao-acoes">
            <button
              className="btn btn-primary"
              onClick={() => void inscreverSe(evento)}
              disabled={jaInscrito || comecou || lotado}
              title={!jaInscrito && comecou ? "O evento já começou: não aceita mais inscrições." : !jaInscrito && lotado ? "Todas as vagas estão ocupadas." : undefined}
            >
              {rotuloBotao}
            </button>
            {podeFazerCheckin && (
              <button className="btn btn-primary" onClick={() => setPedindoCheckin(evento)}>
                Fazer check-in
              </button>
            )}
            {podeCancelar && (
              <button className="btn btn-ghost btn-danger" onClick={() => setCancelandoInscricao(evento)}>
                Cancelar inscrição
              </button>
            )}
          </div>
          )}
          {!jaInscrito && erroPorEvento[evento.id] && (
            <p className="form-error erro-inscricao" role="alert">
              {erroPorEvento[evento.id]}
            </p>
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      <PageHeader title="Eventos" />

      <div className="card eventos-aluno-barra">
        <div className="eventos-aluno-opcoes" role="radiogroup" aria-label="Quais eventos mostrar">
          {OPCOES.map((o) => (
            <label key={o.valor} className={"eventos-aluno-opcao" + (opcao === o.valor ? " selecionada" : "")}>
              <input type="radio" name="opcaoEventos" value={o.valor} checked={opcao === o.valor} onChange={() => setOpcao(o.valor)} />
              <span>
                {o.rotulo} ({porOpcao[o.valor].length})
              </span>
            </label>
          ))}
        </div>
        <input
          type="search"
          className="search-input eventos-aluno-busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome da palestra"
          aria-label="Buscar pelo nome da palestra"
        />
      </div>

      {carregando ? (
        <div className="card">
          <p className="empty-cell">Carregando eventos…</p>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card">
          <p className="empty-cell">
            {termo ? `Nenhum evento com "${busca.trim()}" no nome em "${rotuloDaOpcao}".` : LISTA_VAZIA[opcao]}
          </p>
        </div>
      ) : (
        <ul className="evento-cartoes">{visiveis.map(cartaoDoEvento)}</ul>
      )}

      {pedindoCheckin && (
        <ConfirmDialog
          title={`Check-in em "${pedindoCheckin.titulo}"`}
          message="Confirma que você está no local do evento?"
          confirmLabel="Fazer check-in"
          cancelLabel="Voltar"
          onConfirm={() => void fazerCheckin()}
          onCancel={() => setPedindoCheckin(null)}
        />
      )}

      {cancelandoInscricao && (
        <ConfirmDialog
          title="Cancelar inscrição"
          message={`Cancelar sua inscrição em "${cancelandoInscricao.titulo}"? A vaga fica livre e você pode se inscrever de novo enquanto houver vagas.`}
          confirmLabel="Cancelar inscrição"
          cancelLabel="Manter inscrição"
          tone="danger"
          onConfirm={() => void cancelarInscricao()}
          onCancel={() => setCancelandoInscricao(null)}
        />
      )}
    </div>
  );
}
