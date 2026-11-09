import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError, checkinService, eventoService, inscricaoAlunoService, inscricaoService, palestranteService, salaService } from "../../services";
import type { Evento, Inscricao, Palestrante, Sala, StatusPresenca } from "../../types";
import { dataHora, janelaDoCheckin, rotuloPresencaParaAluno, situacaoDaJanela } from "../../utils/presenca";

const COR_DO_CHECKIN: Partial<Record<StatusPresenca, string>> = {
  SOLICITADO: "checkin-aguardando",
  PRESENTE: "checkin-confirmado",
  RECUSADO: "checkin-recusado",
  AUSENTE: "checkin-recusado",
};

const FILTROS_VAZIOS = { dia: "", horaInicio: "", horaFim: "", salaId: "", busca: "" };

// dia do evento no fuso do navegador ("2026-11-05"): fatiar a ISO (UTC) jogaria evento das 21h em diante pro dia seguinte
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "14:00" no fuso do navegador, no mesmo formato do <input type="time">
function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// agrupa por dia (local), mantendo a ordem em que os eventos chegam
function agruparPorDia(eventos: Evento[]): [string, Evento[]][] {
  const grupos = new Map<string, Evento[]>();
  for (const evento of eventos) {
    const dia = diaLocal(evento.horario);
    grupos.set(dia, [...(grupos.get(dia) ?? []), evento]);
  }
  return [...grupos.entries()];
}

function tituloDoDia(dia: string): string {
  return new Date(`${dia}T00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

// tela Eventos do aluno: a programacao (com filtros por dia, horario, sala e texto, e as vagas de
// cada evento) e as acoes de inscrever/cancelar no mesmo lugar. Antes eram duas telas (Eventos e
// Agenda) listando os mesmos eventos
export function EventosAluno() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  // enquanto carrega, a tela diz "Carregando" (e nao "Nenhum evento cadastrado", que parece erro)
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [avisoPorEvento, setAvisoPorEvento] = useState<Record<string, string>>({});
  // evento cuja inscricao o aluno esta cancelando (aguardando a confirmacao)
  const [cancelandoInscricao, setCancelandoInscricao] = useState<Evento | null>(null);
  // evento em que o aluno esta pedindo o check-in (aguardando a confirmacao "estou no local")
  const [pedindoCheckin, setPedindoCheckin] = useState<Evento | null>(null);

  useEffect(() => {
    // o backend ja devolve so as inscricoes do proprio aluno
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
      setAvisoPorEvento((prev) => ({ ...prev, [evento.id]: mensagem }));
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
  const jaComecou = (evento: Evento) => new Date(evento.horario).getTime() <= agora;
  const nomeDaSala = (evento: Evento) => salas.find((s) => s.id === evento.salaId)?.nome ?? "—";
  const nomeDoPalestrante = (evento: Evento) => palestrantes.find((p) => p.id === evento.palestranteId)?.nome ?? "—";

  const filtrados = eventos.filter((evento) => {
    if (filtros.dia && diaLocal(evento.horario) !== filtros.dia) return false;
    const hora = horaLocal(evento.horario);
    if (filtros.horaInicio && hora < filtros.horaInicio) return false;
    if (filtros.horaFim && hora > filtros.horaFim) return false;
    if (filtros.salaId && evento.salaId !== filtros.salaId) return false;
    const termo = filtros.busca.trim().toLowerCase();
    if (termo) {
      const texto = `${evento.titulo} ${evento.tema ?? ""} ${nomeDoPalestrante(evento)}`.toLowerCase();
      if (!texto.includes(termo)) return false;
    }
    return true;
  });
  // evento ja comecado em que o aluno esta inscrito e o check-in ainda esta aberto continua nos proximos:
  // e la que ele faz o check-in e acompanha a aprovacao
  const minhaInscricaoEm = (evento: Evento) =>
    inscricoes.find((i) => i.participanteId === usuario?.participanteId && i.eventoId === evento.id);
  const emAndamentoComigo = (evento: Evento) =>
    jaComecou(evento) && Boolean(minhaInscricaoEm(evento)) && situacaoDaJanela(evento, agora) === "ABERTA";
  const proximos = filtrados.filter((e) => !jaComecou(e) || emAndamentoComigo(e));
  // encerrados do mais recente pro mais antigo, e so quando o aluno pede
  const encerrados = mostrarEncerrados ? filtrados.filter((e) => jaComecou(e) && !emAndamentoComigo(e)).reverse() : [];
  const filtrosAtivos = Object.values(filtros).some(Boolean);

  function itemDoEvento(evento: Evento) {
    const sala = salas.find((s) => s.id === evento.salaId);
    const minhaInscricao = minhaInscricaoEm(evento);
    const jaInscrito = Boolean(minhaInscricao);
    const comecou = jaComecou(evento);
    // mesma regra do backend: depois que o evento comeca, o aluno nao se inscreve nem cancela
    const podeCancelar = minhaInscricao?.statusPresenca === "PENDENTE" && !comecou;
    // check-in: o botao so aparece com a janela aberta e a inscricao ainda sem pedido
    const janela = situacaoDaJanela(evento, agora);
    const podeFazerCheckin = minhaInscricao?.statusPresenca === "PENDENTE" && janela === "ABERTA";
    const situacaoCheckin = minhaInscricao && minhaInscricao.statusPresenca !== "PENDENTE" ? minhaInscricao.statusPresenca : null;
    return (
      <li key={evento.id} className="agenda-item">
        <div className="agenda-time" style={{ width: 60 }}>
          {horaLocal(evento.horario)}
        </div>
        <div className="agenda-details" style={{ flex: 1 }}>
          <div className="simple-list-title">{evento.titulo}</div>
          <div className="simple-list-sub">Tema: {evento.tema || "—"}</div>
          <div className="simple-list-sub">Palestrante: {nomeDoPalestrante(evento)}</div>
          <div className="simple-list-sub">
            Local: {nomeDaSala(evento)} · {evento.inscritos ?? 0}/{sala?.capacidade || "—"} inscritos
          </div>
          {situacaoCheckin && (
            <p className={"checkin-situacao " + (COR_DO_CHECKIN[situacaoCheckin] ?? "")}>{rotuloPresencaParaAluno(situacaoCheckin)}</p>
          )}
          {minhaInscricao?.statusPresenca === "PENDENTE" && janela === "ANTES" && (
            <p className="form-hint">O check-in abre em {dataHora(janelaDoCheckin(evento).abre)} (1 hora antes do início).</p>
          )}
          {avisoPorEvento[evento.id] && <p className="form-hint">{avisoPorEvento[evento.id]}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "center" }}>
          <button
            className="btn btn-primary"
            onClick={() => void inscreverSe(evento)}
            disabled={jaInscrito || comecou}
            title={!jaInscrito && comecou ? "O evento já começou: não aceita mais inscrições." : undefined}
          >
            {jaInscrito ? "Inscrito" : comecou ? "Encerrado" : "Inscrever-se"}
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
      </li>
    );
  }

  function secaoPorDia(lista: Evento[]) {
    return agruparPorDia(lista).map(([dia, itens]) => (
      <div className="card" key={dia}>
        <h3>{tituloDoDia(dia)}</h3>
        <ul className="agenda-list">{itens.map(itemDoEvento)}</ul>
      </div>
    ));
  }

  return (
    <div>
      <PageHeader title="Eventos" />

      <div className="card">
        <div className="field-row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Dia</span>
            <input type="date" value={filtros.dia} onChange={(e) => setFiltros({ ...filtros, dia: e.target.value })} />
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Horário inicial</span>
            <input type="time" value={filtros.horaInicio} onChange={(e) => setFiltros({ ...filtros, horaInicio: e.target.value })} />
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Horário final</span>
            <input type="time" value={filtros.horaFim} onChange={(e) => setFiltros({ ...filtros, horaFim: e.target.value })} />
          </label>
          <label className="field" style={{ minWidth: 160 }}>
            <span>Sala</span>
            <select value={filtros.salaId} onChange={(e) => setFiltros({ ...filtros, salaId: e.target.value })}>
              <option value="">Todas as salas</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            <span>Buscar</span>
            <input
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              placeholder="Título, tema ou palestrante"
            />
          </label>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <span>&nbsp;</span>
            <button type="button" className="btn btn-ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              Limpar filtros
            </button>
          </div>
        </div>
        <label className="lgpd-consent" style={{ marginTop: 8 }}>
          <input
            id="mostrarEncerrados"
            type="checkbox"
            checked={mostrarEncerrados}
            onChange={(e) => setMostrarEncerrados(e.target.checked)}
          />
          <span>Mostrar também os eventos que já aconteceram</span>
        </label>
      </div>

      {secaoPorDia(proximos)}

      {eventos.length > 0 && proximos.length === 0 && (
        <div className="card">
          <p className="empty-cell">
            {filtrosAtivos ? "Nenhum evento encontrado para os filtros aplicados." : "Nenhum evento programado no momento."}
          </p>
        </div>
      )}
      {eventos.length === 0 && (
        <div className="card">
          <p className="empty-cell">{carregando ? "Carregando eventos…" : "Nenhum evento cadastrado."}</p>
        </div>
      )}

      {encerrados.length > 0 && (
        <>
          <h2 style={{ margin: "24px 0 12px" }}>Eventos encerrados</h2>
          {secaoPorDia(encerrados)}
        </>
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
