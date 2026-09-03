import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { certificadoService, eventoService, type CertificadoDisponivel } from "../../services";
import type { Evento } from "../../types";

export function CertificadosPage() {
  const { usuario } = useAuth();
  const isEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";

  const [certificados, setCertificados] = useState<CertificadoDisponivel[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [filtroEventoId, setFiltroEventoId] = useState("");

  useEffect(() => {
    void carregar();
  }, [usuario?.id]);

  async function carregar() {
    if (isEquipe) {
      const [c, e] = await Promise.all([certificadoService.listarTodosCertificados(), eventoService.list()]);
      setCertificados(c);
      setEventos(e);
    } else if (usuario?.participanteId) {
      setCertificados(await certificadoService.listarCertificadosDoParticipante(usuario.participanteId));
    }
  }

  const filtrados = certificados.filter((c) => !filtroEventoId || c.eventoId === filtroEventoId);

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Certificados" subtitle="Certificados de participação disponíveis para emissão" />
        <div className="card">
          {certificados.length === 0 ? (
            <p className="empty-cell">
              Você ainda não possui certificados. Os certificados são liberados após a confirmação de presença.
            </p>
          ) : (
            <ul className="simple-list">
              {certificados.map((c) => (
                <li key={c.inscricaoId} className="simple-list-item simple-list-item-row">
                  <div>
                    <div className="simple-list-title">{c.eventoTitulo}</div>
                    <div className="simple-list-sub">
                      {c.tema} · {c.data ? new Date(c.data).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => certificadoService.gerarCertificado(c)}>
                    Emitir certificado
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Certificados" subtitle="Emissão de certificados por evento" />

      <div className="card">
        <select className="search-input" value={filtroEventoId} onChange={(e) => setFiltroEventoId(e.target.value)}>
          <option value="">Todos os eventos</option>
          {eventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.titulo}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>RGM</th>
              <th>Evento</th>
              <th>Carga horária</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.inscricaoId}>
                <td>{c.participanteNome}</td>
                <td>{c.participanteRgm}</td>
                <td>{c.eventoTitulo}</td>
                <td>{c.cargaHoraria}h</td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => certificadoService.gerarCertificado(c)}>
                    Emitir certificado
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Nenhum certificado disponível para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
