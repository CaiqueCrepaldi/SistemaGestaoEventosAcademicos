import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/StatCard";
import { eventoService, inscricaoService, sessaoService } from "../../services";
import { relatorioService, type EstatisticasGerais } from "../../services/relatorioService";
import type { Evento, Sessao } from "../../types";

interface LinhaEvento {
  evento: Evento;
  inscritos: number;
  presentes: number;
  sessoesCount: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<EstatisticasGerais | null>(null);
  const [linhas, setLinhas] = useState<LinhaEvento[]>([]);
  const [proximasSessoes, setProximasSessoes] = useState<(Sessao & { eventoNome: string })[]>([]);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [gerais, eventos, sessoes, inscricoes] = await Promise.all([
      relatorioService.estatisticasGerais(),
      eventoService.list(),
      sessaoService.list(),
      inscricaoService.list(),
    ]);

    setStats(gerais);

    setLinhas(
      eventos.map((evento) => {
        const sessoesDoEvento = sessoes.filter((s) => s.eventoId === evento.id);
        const idsSessoes = new Set(sessoesDoEvento.map((s) => s.id));
        const inscricoesDoEvento = inscricoes.filter((i) => idsSessoes.has(i.sessaoId));
        return {
          evento,
          inscritos: inscricoesDoEvento.length,
          presentes: inscricoesDoEvento.filter((i) => i.statusPresenca === "PRESENTE").length,
          sessoesCount: sessoesDoEvento.length,
        };
      }),
    );

    const agora = new Date().toISOString();
    setProximasSessoes(
      sessoes
        .filter((s) => s.horario >= agora)
        .sort((a, b) => a.horario.localeCompare(b.horario))
        .slice(0, 5)
        .map((s) => ({ ...s, eventoNome: eventos.find((e) => e.id === s.eventoId)?.nome ?? "—" })),
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
                <th>Sessões</th>
                <th>Inscritos</th>
                <th>Presentes</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ evento, inscritos, presentes, sessoesCount }) => (
                <tr key={evento.id}>
                  <td>{evento.nome}</td>
                  <td>{sessoesCount}</td>
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
          <h3>Próximas sessões</h3>
          <ul className="simple-list">
            {proximasSessoes.map((s) => (
              <li key={s.id}>
                <div className="simple-list-title">{s.titulo}</div>
                <div className="simple-list-sub">
                  {s.eventoNome} · {new Date(s.horario).toLocaleString("pt-BR")}
                </div>
              </li>
            ))}
            {proximasSessoes.length === 0 && <li className="empty-cell">Nenhuma sessão futura cadastrada.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
