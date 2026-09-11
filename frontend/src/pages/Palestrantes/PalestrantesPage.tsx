import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { palestranteService } from "../../services";
import type { Palestrante } from "../../types";

// listagem read-only de palestrantes — cadastro/edicao/exclusao foi removido, dados agora sao geridos direto no banco
export function PalestrantesPage() {
  const { usuario } = useAuth();
  const [palestrantes, setPalestrantes] = useState<Palestrante[]>([]);

  useEffect(() => {
    void carregar();
  }, []);

  // busca a lista atualizada de palestrantes
  async function carregar() {
    setPalestrantes(await palestranteService.list());
  }

  // ALUNO ve uma versao mais simples, sem telefone (backend ja tira esse campo pra esse perfil)
  if (usuario?.perfil === "ALUNO") {
    return (
      <div>
        <PageHeader title="Palestrantes" />
        <div className="card">
          <ul className="simple-list">
            {palestrantes.map((palestrante) => (
              <li key={palestrante.id} className="simple-list-item">
                <div className="simple-list-title">{palestrante.nome}</div>
                <div className="simple-list-sub">{palestrante.email}</div>
              </li>
            ))}
            {palestrantes.length === 0 && <p className="empty-cell">Nenhum palestrante cadastrado.</p>}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Palestrantes" />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Telefone</th>
            </tr>
          </thead>
          <tbody>
            {palestrantes.map((palestrante) => (
              <tr key={palestrante.id}>
                <td>{palestrante.nome}</td>
                <td>{palestrante.email}</td>
                <td>{palestrante.telefone}</td>
              </tr>
            ))}
            {palestrantes.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-cell">
                  Nenhum palestrante cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
