import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { dashboardService, type ProximoEventoDashboard, type ResumoDashboard } from "../../services";
import { GraficoAprendizagemPorEvento } from "./GraficoAprendizagemPorEvento";
import { GraficoPresencaPorEvento } from "./GraficoPresencaPorEvento";

// a partir daqui a barra de ocupacao muda de cor (quase cheio); em 100% vira "lotado"
const OCUPACAO_ALTA = 80;

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

function plural(quantidade: number, singular: string, varios: string): string {
  return `${numero(quantidade)} ${quantidade === 1 ? singular : varios}`;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// um proximo evento com a barra de ocupacao de vagas (inscritos / capacidade da sala)
function ProximoEvento({ evento }: { evento: ProximoEventoDashboard }) {
  const percentual = evento.capacidade > 0 ? Math.min((evento.inscritos / evento.capacidade) * 100, 100) : 0;
  const lotado = evento.capacidade > 0 && evento.inscritos >= evento.capacidade;
  const nivel = lotado ? " nivel-lotado" : percentual >= OCUPACAO_ALTA ? " nivel-alto" : "";

  return (
    <li className="proximo-evento">
      <div className="proximo-evento-topo">
        <div>
          <div className="simple-list-title">{evento.titulo}</div>
          <div className="simple-list-sub">
            {dataHora(evento.horario)} · {evento.salaNome}
          </div>
        </div>
        {lotado ? (
          <Badge tone="red">Lotado</Badge>
        ) : (
          <span className="proximo-evento-vagas">
            {numero(evento.inscritos)}/{numero(evento.capacidade)} vagas
          </span>
        )}
      </div>
      <div
        className={"ocupacao" + nivel}
        role="progressbar"
        aria-label={`Vagas preenchidas de ${evento.titulo}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentual)}
        aria-valuetext={`${numero(evento.inscritos)} de ${numero(evento.capacidade)} vagas (${Math.round(percentual)}%)`}
        title={`${Math.round(percentual)}% das vagas preenchidas`}
      >
        <div className="ocupacao-preenchimento" style={{ width: `${percentual}%` }} />
      </div>
    </li>
  );
}

// visao geral da equipe: 8 indicadores (2 linhas de 4 no desktop), proximos eventos com ocupacao,
// presenca por evento e aprendizagem por evento. Tudo vem agregado de GET /api/dashboard numa chamada so
export function DashboardPage() {
  const { usuario } = useAuth();
  // o professor ve so os dados dos eventos dele, sem certificados nem avaliacoes (a API ja manda assim)
  const ehProfessor = usuario?.perfil === "PROFESSOR";
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);

  useEffect(() => {
    dashboardService
      .resumo()
      .then(setResumo)
      .catch((erro: unknown) => toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar o dashboard."));
  }, []);

  if (!resumo) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <p className="form-hint">Carregando indicadores…</p>
      </div>
    );
  }

  const { totais, proximosEventos, eventos } = resumo;
  const checkins = totais.presentes + totais.ausentes;

  return (
    <div>
      <PageHeader title="Dashboard" />
      {ehProfessor && <p className="card-subtitulo dashboard-subtitulo">Dados dos seus eventos</p>}

      <div className="stat-grid dashboard-stats">
        <StatCard
          label="Eventos cadastrados"
          value={numero(totais.eventos)}
          tone="blue"
          hint={(totais.eventosCancelados ?? 0) > 0 ? `Sem contar ${numero(totais.eventosCancelados ?? 0)} cancelado(s)` : undefined}
        />
        <StatCard
          label="Próximos eventos"
          value={numero(totais.eventosFuturos)}
          hint={totais.eventosFuturos === 0 ? "Nenhum agendado" : "Ainda vão acontecer"}
          tone="purple"
        />
        <StatCard
          label="Inscrições"
          value={numero(totais.inscricoes)}
          hint={`${numero(totais.aguardando)} aguardando check-in ou aprovação`}
          tone="blue"
        />
        <StatCard
          label="Ocupação média das salas"
          value={totais.ocupacaoMediaSalas === null ? "—" : `${Math.round(totais.ocupacaoMediaSalas)}%`}
          hint={totais.ocupacaoMediaSalas === null ? "Nenhum evento encerrado ainda" : "Presentes ÷ capacidade, média dos eventos encerrados"}
          tone="purple"
        />
        <StatCard
          label="Taxa de presença"
          value={totais.taxaPresenca === null ? "—" : `${Math.round(totais.taxaPresenca)}%`}
          hint={
            checkins === 0
              ? "Nenhuma presença definida ainda"
              : `${numero(totais.presentes)} presentes de ${plural(checkins, "presença definida", "presenças definidas")} (ausentes incluem recusados)`
          }
          tone="green"
        />
        {totais.certificadosLiberados !== undefined && (
          <StatCard
            label="Certificados liberados"
            value={numero(totais.certificadosLiberados)}
            hint="Presença + 60% no questionário"
            tone="green"
          />
        )}
        <StatCard
          label="Aprovação no questionário"
          value={totais.taxaAprovacao === null ? "—" : `${Math.round(totais.taxaAprovacao)}%`}
          hint="aprovados ÷ alunos que concluíram o questionário"
          tone="blue"
        />
        {totais.totalFeedbacks !== undefined && (
          <StatCard
            label="Média do feedback"
            value={totais.mediaFeedback == null ? "—" : `${totais.mediaFeedback.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5`}
            hint={totais.totalFeedbacks === 0 ? "Nenhuma avaliação ainda" : plural(totais.totalFeedbacks, "avaliação", "avaliações")}
            tone="orange"
          />
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Próximos eventos</h3>
          <p className="card-subtitulo">Vagas preenchidas (inscritos ÷ capacidade da sala)</p>
          {proximosEventos.length === 0 ? (
            <p className="empty-cell">Nenhum evento futuro cadastrado.</p>
          ) : (
            <ul className="proximos-eventos">
              {proximosEventos.map((evento) => (
                <ProximoEvento key={evento.id} evento={evento} />
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>Presença por evento</h3>
          <p className="card-subtitulo">Inscrições de cada evento pela situação do check-in</p>
          <GraficoPresencaPorEvento eventos={eventos} />
        </div>
      </div>

      <div className="card">
        <h3>Aprendizagem por evento</h3>
        <p className="card-subtitulo">
          Alunos com presença confirmada em cada evento pelo resultado do questionário (aprovado com 60% ou mais; reprovado
          depois das 2 tentativas)
        </p>
        <GraficoAprendizagemPorEvento eventos={eventos} />
      </div>
    </div>
  );
}
