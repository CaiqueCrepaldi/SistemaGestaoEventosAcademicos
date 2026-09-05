import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { certificadoService, eventoService, type CertificadoDisponivel } from "../../services";
import type { Evento } from "../../types";
import { PERCENTUAL_APROVACAO } from "../../utils/questionario";

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

  // aluno ve lista simples com questionario/emitir, equipe ve tabela com filtro
  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Certificados" />
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
                    <div className="simple-list-sub">
                      {c.melhorPercentual === null
                        ? `Responda o questionário (mínimo ${PERCENTUAL_APROVACAO}% de acertos) para liberar o certificado.`
                        : c.questionarioAprovado
                          ? `Questionário aprovado: ${c.melhorPercentual}% de acertos.`
                          : `Última tentativa: ${c.melhorPercentual}% de acertos — mínimo de ${PERCENTUAL_APROVACAO}% necessário.`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link className="btn btn-ghost" to={`/eventos/${c.eventoId}/questionario`}>
                      {c.questionarioAprovado ? "Refazer questionário" : "Questionário"}
                    </Link>
                    <button
                      className="btn btn-primary"
                      onClick={() => certificadoService.gerarCertificado(c)}
                      disabled={!c.questionarioAprovado}
                    >
                      Emitir certificado
                    </button>
                  </div>
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
      <PageHeader title="Certificados" />

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
              <th>Nota do questionário</th>
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
                <td>{c.melhorPercentual === null ? "—" : `${c.melhorPercentual}%`}</td>
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
