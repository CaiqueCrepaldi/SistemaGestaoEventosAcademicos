import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { salaService } from "../../services";
import type { Sala } from "../../types";

// listagem read-only de salas — cadastro/edicao/exclusao foi removido, dados agora sao geridos direto no banco
export function SalasPage() {
  const [salas, setSalas] = useState<Sala[]>([]);

  useEffect(() => {
    void carregar();
  }, []);

  // busca a lista atualizada de salas
  async function carregar() {
    setSalas(await salaService.list());
  }

  return (
    <div>
      <PageHeader title="Salas" />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Capacidade</th>
            </tr>
          </thead>
          <tbody>
            {salas.map((sala) => (
              <tr key={sala.id}>
                <td>{sala.nome}</td>
                <td>{sala.capacidade} lugares</td>
              </tr>
            ))}
            {salas.length === 0 && (
              <tr>
                <td colSpan={2} className="empty-cell">
                  Nenhuma sala cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
