import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService, salaService } from "../../services";
import { relatorioService, type SessaoAgenda } from "../../services/relatorioService";
import type { Evento, Sala } from "../../types";

function agruparPorDia(sessoes: SessaoAgenda[]): Record<string, SessaoAgenda[]> {
  return sessoes.reduce<Record<string, SessaoAgenda[]>>((acc, sessao) => {
    const dia = sessao.horario ? sessao.horario.slice(0, 10) : "Sem data";
    acc[dia] = acc[dia] ?? [];
    acc[dia].push(sessao);
    return acc;
  }, {});
}

const FILTROS_VAZIOS = { dia: "", horaInicio: "", horaFim: "", salaId: "", tema: "" };

export function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [sessoes, setSessoes] = useState<SessaoAgenda[]>([]);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);

  useEffect(() => {
    void eventoService.list().then((e) => {
      setEventos(e);
      setEventoId(e[0]?.id ?? "");
    });
    void salaService.list().then(setSalas);
  }, []);

  useEffect(() => {
    if (!eventoId) return;
    void relatorioService.agendaPorEvento(eventoId).then(setSessoes);
  }, [eventoId]);

  const filtradas = sessoes.filter((sessao) => {
    if (filtros.dia && sessao.horario.slice(0, 10) !== filtros.dia) return false;

    if (filtros.horaInicio || filtros.horaFim) {
      const hora = sessao.horario.slice(11, 16);
      if (filtros.horaInicio && hora < filtros.horaInicio) return false;
      if (filtros.horaFim && hora > filtros.horaFim) return false;
    }

    if (filtros.salaId && sessao.salaId !== filtros.salaId) return false;

    if (filtros.tema) {
      const termo = filtros.tema.toLowerCase();
      const noTema = sessao.tema.toLowerCase().includes(termo);
      const noTitulo = sessao.titulo.toLowerCase().includes(termo);
      if (!noTema && !noTitulo) return false;
    }

    return true;
  });

  const grupos = agruparPorDia(filtradas);
  const filtrosAtivos = Object.values(filtros).some(Boolean);

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
              placeholder="Buscar por tema ou título da sessão"
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

      {sessoes.length > 0 && filtradas.length === 0 && filtrosAtivos && (
        <div className="card">
          <p className="empty-cell">Nenhuma sessão encontrada para os filtros aplicados.</p>
        </div>
      )}
    </div>
  );
}
