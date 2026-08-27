import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { eventoService, inscricaoService, palestranteService, salaService, sessaoService } from "../../services";
import type { Evento, Inscricao, Palestrante, Sala, Sessao } from "../../types";

export function EventoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const [evento, setEvento] = useState<Evento | null | undefined>(undefined);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [avisoPorSessao, setAvisoPorSessao] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    void carregar(id);
  }, [id]);

  async function carregar(eventoId: string) {
    const [e, s, sa, p, i] = await Promise.all([
      eventoService.get(eventoId),
      sessaoService.list(),
      salaService.list(),
      palestranteService.list(),
      inscricaoService.list(),
    ]);
    setEvento(e ?? null);
    setSessoes(s.filter((sessao) => sessao.eventoId === eventoId));
    setSalas(sa);
    setPalestrantes(p);
    setInscricoes(i);
  }

  async function inscreverSe(sessao: Sessao) {
    if (!usuario?.participanteId) {
      setAvisoPorSessao((prev) => ({ ...prev, [sessao.id]: "Disponível apenas para contas de aluno." }));
      return;
    }

    const jaInscrito = inscricoes.some(
      (i) => i.participanteId === usuario.participanteId && i.sessaoId === sessao.id,
    );
    if (jaInscrito) {
      setAvisoPorSessao((prev) => ({ ...prev, [sessao.id]: "Você já está inscrito nesta sessão." }));
      return;
    }

    const sala = salas.find((s) => s.id === sessao.salaId);
    const ocupadas = inscricoes.filter((i) => i.sessaoId === sessao.id).length;
    if (sala && ocupadas >= sala.capacidade) {
      setAvisoPorSessao((prev) => ({ ...prev, [sessao.id]: "Sessão sem vagas disponíveis." }));
      return;
    }

    const nova = await inscricaoService.create({
      participanteId: usuario.participanteId,
      sessaoId: sessao.id,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
    setInscricoes((prev) => [...prev, nova]);
    setAvisoPorSessao((prev) => ({ ...prev, [sessao.id]: "Inscrição confirmada." }));
  }

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
          {sessoes.map((sessao) => {
            const sala = salas.find((s) => s.id === sessao.salaId);
            const palestrante = palestrantes.find((p) => p.id === sessao.palestranteId);
            const jaInscrito = inscricoes.some(
              (i) => i.participanteId === usuario?.participanteId && i.sessaoId === sessao.id,
            );
            return (
              <li key={sessao.id} className="agenda-item">
                <div className="agenda-time" style={{ width: 90 }}>
                  {sessao.horario ? (
                    <>
                      <div>{new Date(sessao.horario).toLocaleDateString("pt-BR")}</div>
                      <div>
                        {new Date(sessao.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="agenda-details" style={{ flex: 1 }}>
                  <div className="simple-list-title">{sessao.titulo}</div>
                  <div className="simple-list-sub">Tema: {sessao.tema || "—"}</div>
                  <div className="simple-list-sub">Palestrante: {palestrante?.nome ?? "—"}</div>
                  <div className="simple-list-sub">Local: {sala?.nome ?? "—"}</div>
                  {avisoPorSessao[sessao.id] && <p className="form-hint">{avisoPorSessao[sessao.id]}</p>}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ alignSelf: "center" }}
                  onClick={() => void inscreverSe(sessao)}
                  disabled={jaInscrito}
                >
                  {jaInscrito ? "Inscrito" : "Inscrever-se"}
                </button>
              </li>
            );
          })}
          {sessoes.length === 0 && <p className="empty-cell">Nenhuma sessão cadastrada para este evento.</p>}
        </ul>
      </div>
    </div>
  );
}
