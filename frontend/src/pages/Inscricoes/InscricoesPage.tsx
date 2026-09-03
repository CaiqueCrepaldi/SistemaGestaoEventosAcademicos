import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { eventoService, inscricaoService, participanteService, salaService } from "../../services";
import type { Evento, Inscricao, Participante, Sala, StatusPresenca } from "../../types";

// Duas funções pequenas que só traduzem o status em cor/texto pra Badge —
// PENDENTE cai no `return` final de cada uma (não precisa de `if` próprio
// porque é o único caso que sobra depois de checar os outros dois).
function badgeTone(status: StatusPresenca): "green" | "red" | "orange" {
  if (status === "PRESENTE") return "green";
  if (status === "AUSENTE") return "red";
  return "orange";
}

function badgeLabel(status: StatusPresenca): string {
  if (status === "PRESENTE") return "Presente";
  if (status === "AUSENTE") return "Ausente";
  return "Pendente";
}

export function InscricoesPage() {
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [participanteId, setParticipanteId] = useState("");
  const [eventoId, setEventoId] = useState("");
  const [avisoVagas, setAvisoVagas] = useState<string | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [i, p, e, sa] = await Promise.all([
      inscricaoService.list(),
      participanteService.list(),
      eventoService.list(),
      salaService.list(),
    ]);
    setInscricoes(i);
    setParticipantes(p);
    setEventos(e);
    setSalas(sa);
  }

  function abrirNova() {
    setParticipanteId(participantes[0]?.id ?? "");
    setEventoId(eventos[0]?.id ?? "");
    setAvisoVagas(null);
    setModalAberto(true);
  }

  // Vagas = capacidade da sala menos quantas inscrições esse evento já tem.
  // Devolve null (em vez de um número) quando não dá pra calcular — evento
  // ou sala inexistente — pra tela saber que não deve mostrar aviso de vaga.
  function vagasDisponiveis(evento: Evento | undefined): number | null {
    if (!evento) return null;
    const sala = salas.find((s) => s.id === evento.salaId);
    if (!sala) return null;
    const ocupadas = inscricoes.filter((i) => i.eventoId === evento.id).length;
    return sala.capacidade - ocupadas;
  }

  async function salvar() {
    // Duas checagens em sequência, cada uma com seu próprio "return" se
    // falhar: 1) esse participante já está inscrito nesse evento? 2) ainda
    // tem vaga? Só se passar nas duas é que a inscrição é criada de fato.
    const jaInscrito = inscricoes.some((i) => i.participanteId === participanteId && i.eventoId === eventoId);
    if (jaInscrito) {
      setAvisoVagas("Este participante já está inscrito neste evento.");
      return;
    }
    const evento = eventos.find((e) => e.id === eventoId);
    const vagas = vagasDisponiveis(evento);
    if (vagas !== null && vagas <= 0) {
      setAvisoVagas("Não há vagas disponíveis para este evento.");
      return;
    }
    await inscricaoService.create({
      participanteId,
      eventoId,
      statusPresenca: "PENDENTE",
      dataCheckin: null,
      usuarioId: null,
    });
    setModalAberto(false);
    await carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Remover esta inscrição?")) return;
    await inscricaoService.remove(id);
    await carregar();
  }

  const eventoSelecionado = eventos.find((e) => e.id === eventoId);
  const vagas = vagasDisponiveis(eventoSelecionado);

  return (
    <div>
      <PageHeader
        title="Inscrições"
        subtitle="Vínculo entre participantes e eventos"
        actions={
          <button
            className="btn btn-primary"
            onClick={abrirNova}
            disabled={participantes.length === 0 || eventos.length === 0}
          >
            + Nova inscrição
          </button>
        }
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Evento</th>
              <th>Status</th>
              <th>Check-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inscricoes.map((inscricao) => {
              const participante = participantes.find((p) => p.id === inscricao.participanteId);
              const evento = eventos.find((e) => e.id === inscricao.eventoId);
              return (
                <tr key={inscricao.id}>
                  <td>{participante?.nome ?? "—"}</td>
                  <td>{evento?.titulo ?? "—"}</td>
                  <td>
                    <Badge tone={badgeTone(inscricao.statusPresenca)}>{badgeLabel(inscricao.statusPresenca)}</Badge>
                  </td>
                  <td>{inscricao.dataCheckin ? new Date(inscricao.dataCheckin).toLocaleString("pt-BR") : "—"}</td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-danger" onClick={() => excluir(inscricao.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
            {inscricoes.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Nenhuma inscrição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title="Nova inscrição" onClose={() => setModalAberto(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <label className="field">
              <span>Participante</span>
              <select value={participanteId} onChange={(e) => setParticipanteId(e.target.value)} required>
                {participantes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.rgm}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Evento</span>
              <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} required>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
            </label>
            {vagas !== null && (
              <p className={vagas <= 0 ? "form-error" : "form-hint"}>
                {vagas > 0 ? `${vagas} vaga(s) disponível(is) neste evento.` : "Evento sem vagas disponíveis."}
              </p>
            )}
            {avisoVagas && <p className="form-error">{avisoVagas}</p>}
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Inscrever
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
