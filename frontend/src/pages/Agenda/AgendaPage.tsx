import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService } from "../../services";
import { relatorioService, type SessaoAgenda } from "../../services/relatorioService";
import type { Evento } from "../../types";

function agruparPorDia(sessoes: SessaoAgenda[]): Record<string, SessaoAgenda[]> {
  return sessoes.reduce<Record<string, SessaoAgenda[]>>((acc, sessao) => {
    const dia = sessao.horario ? sessao.horario.slice(0, 10) : "Sem data";
    acc[dia] = acc[dia] ?? [];
    acc[dia].push(sessao);
    return acc;
  }, {});
}

export function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [sessoes, setSessoes] = useState<SessaoAgenda[]>([]);

  useEffect(() => {
    void eventoService.list().then((e) => {
      setEventos(e);
      setEventoId(e[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!eventoId) return;
    void relatorioService.agendaPorEvento(eventoId).then(setSessoes);
  }, [eventoId]);

  const grupos = agruparPorDia(sessoes);

  return (
    <div>
      <PageHeader title="Agenda" subtitle="Programação das sessões por evento" />

      <div className="card">
        <select className="search-input" value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          {eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>

      {Object.entries(grupos)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, itens]) => (
          <div className="card" key={dia}>
            <h3>
              {dia !== "Sem data"
                ? new Date(dia + "T00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })
                : "Sem data definida"}
            </h3>
            <ul className="agenda-list">
              {itens.map((sessao) => (
                <li key={sessao.id} className="agenda-item">
                  <div className="agenda-time">
                    {sessao.horario ? new Date(sessao.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                  <div className="agenda-details">
                    <div className="simple-list-title">{sessao.titulo}</div>
                    <div className="simple-list-sub">
                      {sessao.salaNome} · {sessao.inscritos}/{sessao.capacidade || "—"} inscritos
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {sessoes.length === 0 && eventoId && (
        <div className="card">
          <p className="empty-cell">Nenhuma sessão cadastrada para este evento.</p>
        </div>
      )}
    </div>
  );
}
