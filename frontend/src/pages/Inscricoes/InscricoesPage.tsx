import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { inscricaoService, participanteService, salaService, sessaoService } from "../../services";
import type { Inscricao, Participante, Sala, Sessao, StatusPresenca } from "../../types";

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
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [participanteId, setParticipanteId] = useState("");
  const [sessaoId, setSessaoId] = useState("");
  const [avisoVagas, setAvisoVagas] = useState<string | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    const [i, p, s, sa] = await Promise.all([
      inscricaoService.list(),
      participanteService.list(),
      sessaoService.list(),
      salaService.list(),
    ]);
    setInscricoes(i);
    setParticipantes(p);
    setSessoes(s);
    setSalas(sa);
  }

  function abrirNova() {
    setParticipanteId(participantes[0]?.id ?? "");
    setSessaoId(sessoes[0]?.id ?? "");
    setAvisoVagas(null);
    setModalAberto(true);
  }

  function vagasDisponiveis(sessao: Sessao | undefined): number | null {
    if (!sessao) return null;
    const sala = salas.find((s) => s.id === sessao.salaId);
    if (!sala) return null;
    const ocupadas = inscricoes.filter((i) => i.sessaoId === sessao.id).length;
    return sala.capacidade - ocupadas;
  }

  async function salvar() {
    const jaInscrito = inscricoes.some((i) => i.participanteId === participanteId && i.sessaoId === sessaoId);
    if (jaInscrito) {
      setAvisoVagas("Este participante já está inscrito nesta sessão.");
      return;
    }
    const sessao = sessoes.find((s) => s.id === sessaoId);
    const vagas = vagasDisponiveis(sessao);
    if (vagas !== null && vagas <= 0) {
      setAvisoVagas("Não há vagas disponíveis para esta sessão.");
      return;
    }
    await inscricaoService.create({
      participanteId,
      sessaoId,
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

  const sessaoSelecionada = sessoes.find((s) => s.id === sessaoId);
  const vagas = vagasDisponiveis(sessaoSelecionada);

  return (
    <div>
      <PageHeader
        title="Inscrições"
        subtitle="Vínculo entre participantes e sessões"
        actions={
          <button
            className="btn btn-primary"
            onClick={abrirNova}
            disabled={participantes.length === 0 || sessoes.length === 0}
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
              <th>Sessão</th>
              <th>Status</th>
              <th>Check-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inscricoes.map((inscricao) => {
              const participante = participantes.find((p) => p.id === inscricao.participanteId);
              const sessao = sessoes.find((s) => s.id === inscricao.sessaoId);
              return (
                <tr key={inscricao.id}>
                  <td>{participante?.nome ?? "—"}</td>
                  <td>{sessao?.titulo ?? "—"}</td>
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
              <span>Sessão</span>
              <select value={sessaoId} onChange={(e) => setSessaoId(e.target.value)} required>
                {sessoes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titulo}
                  </option>
                ))}
              </select>
            </label>
            {vagas !== null && (
              <p className={vagas <= 0 ? "form-error" : "form-hint"}>
                {vagas > 0 ? `${vagas} vaga(s) disponível(is) nesta sessão.` : "Sessão sem vagas disponíveis."}
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
