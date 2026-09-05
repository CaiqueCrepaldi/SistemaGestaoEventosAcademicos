import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { checkinService, eventoService } from "../../services";
import type { InscricaoDetalhada } from "../../services/checkinService";
import type { Evento, Participante, StatusPresenca } from "../../types";

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

function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

export function CheckinPage() {
  const { usuario } = useAuth();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Participante[]>([]);
  const [selecionado, setSelecionado] = useState<Participante | null>(null);
  const [inscricoes, setInscricoes] = useState<InscricaoDetalhada[]>([]);

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoExportar, setEventoExportar] = useState("");

  useEffect(() => {
    void eventoService.list().then((e) => {
      setEventos(e);
      setEventoExportar(e[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    void checkinService.buscarParticipantes(termo).then(setResultados);
  }, [termo]);

  async function selecionar(participante: Participante) {
    setSelecionado(participante);
    setInscricoes(await checkinService.listarInscricoesDoParticipante(participante.id));
  }

  async function confirmar(inscricaoId: string) {
    if (!usuario) return;
    await checkinService.confirmarPresenca(inscricaoId, usuario.id);
    if (selecionado) setInscricoes(await checkinService.listarInscricoesDoParticipante(selecionado.id));
  }

  async function marcarAusente(inscricaoId: string) {
    await checkinService.marcarAusente(inscricaoId);
    if (selecionado) setInscricoes(await checkinService.listarInscricoesDoParticipante(selecionado.id));
  }

  async function exportar() {
    const lista = await checkinService.listarPresencaPorEvento(eventoExportar);
    const evento = eventos.find((e) => e.id === eventoExportar);
    const csv = checkinService.gerarCsvPresenca(lista);
    baixarCsv(`presenca-${evento?.titulo ?? "evento"}.csv`, csv);
  }

  return (
    <div>
      <PageHeader title="Check-in" />

      <div className="grid-2">
        <div className="card">
          <h3>Buscar participante</h3>
          <input
            className="search-input"
            placeholder="Nome, e-mail ou RGM…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoFocus
          />
          <ul className="simple-list">
            {resultados.map((participante) => (
              <li
                key={participante.id}
                className={"simple-list-item clickable" + (selecionado?.id === participante.id ? " selected" : "")}
                onClick={() => void selecionar(participante)}
              >
                <div className="simple-list-title">{participante.nome}</div>
                <div className="simple-list-sub">
                  {participante.email} · RGM {participante.rgm}
                </div>
              </li>
            ))}
            {termo && resultados.length === 0 && <li className="empty-cell">Nenhum participante encontrado.</li>}
          </ul>
        </div>

        <div className="card">
          <h3>{selecionado ? `Inscrições de ${selecionado.nome}` : "Selecione um participante"}</h3>
          {selecionado && (
            <table className="table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((item) => (
                  <tr key={item.inscricao.id}>
                    <td>{item.eventoTitulo}</td>
                    <td>
                      <Badge tone={badgeTone(item.inscricao.statusPresenca)}>
                        {badgeLabel(item.inscricao.statusPresenca)}
                      </Badge>
                    </td>
                    <td className="table-actions">
                      <button className="btn btn-primary" onClick={() => void confirmar(item.inscricao.id)}>
                        Confirmar presença
                      </button>
                      <button className="btn btn-ghost" onClick={() => void marcarAusente(item.inscricao.id)}>
                        Ausente
                      </button>
                    </td>
                  </tr>
                ))}
                {inscricoes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      Este participante não possui inscrições.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Exportar lista de presença</h3>
        <div className="field-row">
          <select className="search-input" value={eventoExportar} onChange={(e) => setEventoExportar(e.target.value)}>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => void exportar()} disabled={!eventoExportar}>
            Exportar CSV
          </button>
        </div>
      </div>
    </div>
  );
}
