import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { participanteService } from "../../services";
import type { Participante } from "../../types";

// listagem read-only de participantes, com busca por nome/email/rgm — cadastro/edicao/exclusao pela interface foi removido
export function ParticipantesPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    void carregar();
  }, []);

  // busca a lista atualizada de participantes
  async function carregar() {
    setParticipantes(await participanteService.list());
  }

  const filtrados = participantes.filter((p) => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return true;
    return p.nome.toLowerCase().includes(alvo) || p.email.toLowerCase().includes(alvo) || p.rgm.includes(alvo);
  });

  return (
    <div>
      <PageHeader title="Participantes" />

      <div className="card">
        <input
          className="search-input"
          placeholder="Buscar por nome, e-mail ou RGM…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>RGM</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((participante) => (
              <tr key={participante.id}>
                <td>{participante.nome}</td>
                <td>{participante.email}</td>
                <td>{participante.rgm}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-cell">
                  Nenhum participante encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
