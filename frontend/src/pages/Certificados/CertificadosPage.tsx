import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { eventoService, inscricaoService, sessaoService } from "../../services";
import type { Evento } from "../../types";

export function CertificadosPage() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [certificado, setCertificado] = useState<Evento | null>(null);

  useEffect(() => {
    if (!usuario?.participanteId) return;
    void carregar(usuario.participanteId);
  }, [usuario?.participanteId]);

  async function carregar(participanteId: string) {
    const [inscricoes, sessoes, todosEventos] = await Promise.all([
      inscricaoService.list(),
      sessaoService.list(),
      eventoService.list(),
    ]);

    const sessoesPresentes = inscricoes
      .filter((i) => i.participanteId === participanteId && i.statusPresenca === "PRESENTE")
      .map((i) => sessoes.find((s) => s.id === i.sessaoId))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    const eventoIds = new Set(sessoesPresentes.map((s) => s.eventoId));
    setEventos(todosEventos.filter((e) => eventoIds.has(e.id)));
  }

  return (
    <div>
      <PageHeader title="Certificados" subtitle="Certificados de participação disponíveis para emissão" />

      <div className="card">
        <ul className="simple-list">
          {eventos.map((evento) => (
            <li key={evento.id} className="simple-list-item simple-list-item-row">
              <div>
                <div className="simple-list-title">{evento.nome}</div>
                <div className="simple-list-sub">
                  {new Date(evento.data + "T00:00").toLocaleDateString("pt-BR")} · {evento.local}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setCertificado(evento)}>
                Emitir certificado
              </button>
            </li>
          ))}
        </ul>
        {eventos.length === 0 && (
          <p className="empty-cell">
            Nenhum certificado disponível ainda. Certificados são liberados após check-in confirmado em pelo
            menos uma sessão do evento.
          </p>
        )}
      </div>

      {certificado && (
        <Modal title="Certificado de participação" onClose={() => setCertificado(null)}>
          <div className="certificate">
            <p>Certificamos que</p>
            <h2>{usuario?.nome}</h2>
            <p>
              participou do evento <strong>{certificado.nome}</strong>, realizado em{" "}
              {new Date(certificado.data + "T00:00").toLocaleDateString("pt-BR")} em {certificado.local}.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setCertificado(null)}>
              Fechar
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
