import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService } from "../../services";
import { relatorioService, type SessaoAgenda } from "../../services/relatorioService";
import type { Evento } from "../../types";

export function EventoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [evento, setEvento] = useState<Evento | null | undefined>(undefined);
  const [sessoes, setSessoes] = useState<SessaoAgenda[]>([]);

  useEffect(() => {
    if (!id) return;
    void eventoService.get(id).then((e) => setEvento(e ?? null));
    void relatorioService.agendaPorEvento(id).then(setSessoes);
  }, [id]);

  if (evento === undefined) return null;

  if (evento === null) {
    return (
      <div>
        <PageHeader title="Evento não encontrado" />
        <div className="card">
          <p className="empty-cell">Este evento não existe ou foi removido.</p>
          <Link to="/eventos" className="btn btn-ghost">
            Voltar para eventos
          </Link>
        </div>
      </div>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={evento.nome}
        subtitle={`${new Date(evento.data + "T00:00").toLocaleDateString("pt-BR")} · ${evento.local}`}
        actions={
          <Link to="/eventos" className="btn btn-ghost">
            Voltar
          </Link>
        }
      />

      <div className="card">
        {evento.data >= hoje ? <Badge tone="green">Programado</Badge> : <Badge tone="neutral">Encerrado</Badge>}
        <p style={{ marginTop: 12 }}>{evento.descricao || "Sem descrição cadastrada."}</p>
      </div>

      <div className="card">
        <h3>Programação</h3>
        <ul className="agenda-list">
          {sessoes.map((sessao) => (
            <li key={sessao.id} className="agenda-item">
              <div className="agenda-time">
                {sessao.horario
                  ? new Date(sessao.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </div>
              <div className="agenda-details">
                <div className="simple-list-title">{sessao.titulo}</div>
                <div className="simple-list-sub">
                  {sessao.salaNome} · {sessao.inscritos}/{sessao.capacidade || "—"} inscritos
                </div>
              </div>
            </li>
          ))}
          {sessoes.length === 0 && <p className="empty-cell">Nenhuma sessão cadastrada para este evento.</p>}
        </ul>
      </div>
    </div>
  );
}
