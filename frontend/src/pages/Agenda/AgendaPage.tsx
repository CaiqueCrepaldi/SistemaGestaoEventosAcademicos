import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { salaService } from "../../services";
import { relatorioService, type EventoAgenda } from "../../services/relatorioService";
import type { Sala } from "../../types";

function agruparPorDia(eventos: EventoAgenda[]): Record<string, EventoAgenda[]> {
  return eventos.reduce<Record<string, EventoAgenda[]>>((acc, evento) => {
    const dia = evento.horario ? evento.horario.slice(0, 10) : "Sem data";
    acc[dia] = acc[dia] ?? [];
    acc[dia].push(evento);
    return acc;
  }, {});
}

const FILTROS_VAZIOS = { dia: "", horaInicio: "", horaFim: "", salaId: "", tema: "" };

export function AgendaPage() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);

  useEffect(() => {
    void salaService.list().then(setSalas);
    void relatorioService.agendaGeral().then(setEventos);
  }, []);

  const filtrados = eventos.filter((evento) => {
    if (filtros.dia && evento.horario.slice(0, 10) !== filtros.dia) return false;

    if (filtros.horaInicio || filtros.horaFim) {
      const hora = evento.horario.slice(11, 16);
      if (filtros.horaInicio && hora < filtros.horaInicio) return false;
      if (filtros.horaFim && hora > filtros.horaFim) return false;
    }

    if (filtros.salaId && evento.salaId !== filtros.salaId) return false;

    if (filtros.tema) {
      const termo = filtros.tema.toLowerCase();
      const noTema = evento.tema.toLowerCase().includes(termo);
      const noTitulo = evento.titulo.toLowerCase().includes(termo);
      if (!noTema && !noTitulo) return false;
    }

    return true;
  });

  const grupos = agruparPorDia(filtrados);
  const filtrosAtivos = Object.values(filtros).some(Boolean);

  return (
    <div>
      <PageHeader title="Agenda" subtitle="Programação completa de eventos" />

      <div className="card">
        <div className="field-row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Dia</span>
            <input
              type="date"
              value={filtros.dia}
              onChange={(e) => setFiltros({ ...filtros, dia: e.target.value })}
            />
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Horário inicial</span>
            <input
              type="time"
              value={filtros.horaInicio}
              onChange={(e) => setFiltros({ ...filtros, horaInicio: e.target.value })}
            />
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span>Horário final</span>
            <input
              type="time"
              value={filtros.horaFim}
              onChange={(e) => setFiltros({ ...filtros, horaFim: e.target.value })}
            />
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
          <label className="field" style={{ minWidth: 200 }}>
            <span>Tema ou título</span>
            <input
              value={filtros.tema}
              onChange={(e) => setFiltros({ ...filtros, tema: e.target.value })}
              placeholder="Buscar por tema ou título do evento"
            />
          </label>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <span>&nbsp;</span>
            <button type="button" className="btn btn-ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              Limpar filtros
            </button>
          </div>
        </div>
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
              {itens.map((evento) => (
                <li key={evento.id} className="agenda-item">
                  <div className="agenda-time">
                    {evento.horario ? new Date(evento.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                  <div className="agenda-details">
                    <div className="simple-list-title">{evento.titulo}</div>
                    <div className="simple-list-sub">
                      {evento.salaNome} · {evento.inscritos}/{evento.capacidade || "—"} inscritos
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {eventos.length === 0 && (
        <div className="card">
          <p className="empty-cell">Nenhum evento cadastrado.</p>
        </div>
      )}

      {eventos.length > 0 && filtrados.length === 0 && filtrosAtivos && (
        <div className="card">
          <p className="empty-cell">Nenhuma sessão encontrada para os filtros aplicados.</p>
        </div>
      )}
    </div>
  );
}
