import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { eventoService, inscricaoService, salaService } from "../../services";
import { relatorioService, type EstatisticasGerais } from "../../services/relatorioService";
import type { Evento, Sala } from "../../types";

// Formato de cada linha da tabela "Eventos" do dashboard — já com o nome da
// sala e as contagens prontas, pra não recalcular isso no JSX.
interface LinhaEvento {
  evento: Evento;
  salaNome: string;
  inscritos: number;
  presentes: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<EstatisticasGerais | null>(null);
  const [linhas, setLinhas] = useState<LinhaEvento[]>([]);
  const [proximosEventos, setProximosEventos] = useState<Evento[]>([]);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [gerais, eventos, salas, inscricoes] = await Promise.all([
      relatorioService.estatisticasGerais(),
      eventoService.list(),
      salaService.list(),
      inscricaoService.list(),
    ]);

    setStats(gerais);

    const salaNome = (salaId: string, salasLista: Sala[]) => salasLista.find((s) => s.id === salaId)?.nome ?? "—";

    // Monta uma linha por evento com o total de inscritos e, dentre eles,
    // quantos já têm presença confirmada.
    setLinhas(
      eventos.map((evento) => {
        const inscricoesDoEvento = inscricoes.filter((i) => i.eventoId === evento.id);
        return {
          evento,
          salaNome: salaNome(evento.salaId, salas),
          inscritos: inscricoesDoEvento.length,
          presentes: inscricoesDoEvento.filter((i) => i.statusPresenca === "PRESENTE").length,
        };
      }),
    );

    // "Próximos eventos" = só os que ainda vão acontecer (horário no futuro),
    // ordenados do mais próximo pro mais distante, mostrando só os 5 primeiros.
    const agora = new Date().toISOString();
    setProximosEventos(
      eventos
        .filter((e) => e.horario >= agora)
        .sort((a, b) => a.horario.localeCompare(b.horario))
        .slice(0, 5),
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral dos eventos, inscrições e ocupação de salas" />

      {stats && (
        <div className="stat-grid">
          <StatCard label="Eventos cadastrados" value={String(stats.totalEventos)} tone="blue" />
          <StatCard label="Inscrições" value={String(stats.totalInscricoes)} tone="purple" />
          <StatCard
            label="Taxa de presença"
            value={`${stats.taxaPresenca.toFixed(0)}%`}
            hint={`${stats.totalPresentes} check-ins confirmados`}
            tone="green"
          />
          <StatCard label="Ocupação média das salas" value={`${stats.ocupacaoMedia.toFixed(0)}%`} tone="orange" />
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Eventos</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Sala</th>
                <th>Inscritos</th>
                <th>Presentes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ evento, salaNome, inscritos, presentes }) => (
                <tr key={evento.id}>
                  <td>{evento.titulo}</td>
                  <td>{salaNome}</td>
                  <td>{inscritos}</td>
                  <td>{presentes}</td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    Nenhum evento cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Próximos eventos</h3>
          <ul className="simple-list">
            {proximosEventos.map((evento) => (
              <li key={evento.id}>
                <div className="simple-list-title">{evento.titulo}</div>
                <div className="simple-list-sub">
                  {evento.tema || "—"} · {new Date(evento.horario).toLocaleString("pt-BR")}
                </div>
              </li>
            ))}
            {proximosEventos.length === 0 && <li className="empty-cell">Nenhum evento futuro cadastrado.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
