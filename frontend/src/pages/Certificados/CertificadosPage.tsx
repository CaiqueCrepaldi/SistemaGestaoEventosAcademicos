import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { certificadoService, eventoService, sessaoService, type CertificadoDisponivel } from "../../services";
import type { Evento, Sessao } from "../../types";

export function CertificadosPage() {
  const { usuario } = useAuth();
  const isEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";

  const [certificados, setCertificados] = useState<CertificadoDisponivel[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [filtroEventoId, setFiltroEventoId] = useState("");
  const [filtroSessaoId, setFiltroSessaoId] = useState("");

  useEffect(() => {
    void carregar();
  }, [usuario?.id]);

  async function carregar() {
    if (isEquipe) {
      const [c, e, s] = await Promise.all([
        certificadoService.listarTodosCertificados(),
        eventoService.list(),
        sessaoService.list(),
      ]);
      setCertificados(c);
      setEventos(e);
      setSessoes(s);
    } else if (usuario?.participanteId) {
      setCertificados(await certificadoService.listarCertificadosDoParticipante(usuario.participanteId));
    }
  }

  const filtrados = certificados.filter((c) => {
    if (filtroEventoId && c.eventoId !== filtroEventoId) return false;
    if (filtroSessaoId && c.sessaoId !== filtroSessaoId) return false;
    return true;
  });

  const sessoesDoFiltro = sessoes.filter((s) => !filtroEventoId || s.eventoId === filtroEventoId);

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
                    <div className="simple-list-title">{c.eventoNome}</div>
                    <div className="simple-list-sub">
                      {c.sessaoTitulo} · {c.data ? new Date(c.data).toLocaleDateString("pt-BR") : "—"}
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
      <PageHeader title="Certificados" subtitle="Emissão de certificados por evento e sessão" />

      <div className="card">
        <div className="field-row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 200 }}>
            <span>Evento</span>
            <select
              value={filtroEventoId}
              onChange={(e) => {
                setFiltroEventoId(e.target.value);
                setFiltroSessaoId("");
              }}
            >
              <option value="">Todos os eventos</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            <span>Sessão</span>
            <select value={filtroSessaoId} onChange={(e) => setFiltroSessaoId(e.target.value)}>
              <option value="">Todas as sessões</option>
              {sessoesDoFiltro.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>RGM</th>
              <th>Evento</th>
              <th>Sessão</th>
              <th>Carga horária</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.inscricaoId}>
                <td>{c.participanteNome}</td>
                <td>{c.participanteRgm}</td>
                <td>{c.eventoNome}</td>
                <td>{c.sessaoTitulo}</td>
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
                <td colSpan={6} className="empty-cell">
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
