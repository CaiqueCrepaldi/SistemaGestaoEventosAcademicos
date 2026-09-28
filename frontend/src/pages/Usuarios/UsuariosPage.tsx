import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { usuarioService, type UsuarioResumo } from "../../services/usuarioService";
import type { Perfil } from "../../types";

const PERFIL_LABEL: Record<Perfil, string> = {
  ADMINISTRADOR: "Administrador",
  SECRETARIA: "Secretaria",
  ALUNO: "Aluno",
};

// so ADMINISTRADOR: situacao do 2FA e do bloqueio de cada conta, com reset do 2FA (perdeu o
// celular) e remocao do bloqueio por excesso de tentativas
export function UsuariosPage() {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [resetando, setResetando] = useState<UsuarioResumo | null>(null);
  const [desbloqueando, setDesbloqueando] = useState<UsuarioResumo | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setUsuarios(await usuarioService.listar());
  }

  async function resetar() {
    if (!resetando) return;
    await usuarioService.resetarMfa(resetando.id);
    toast.success(`2FA de ${resetando.nome} resetado. A configuração será pedida de novo no próximo login.`);
    setResetando(null);
    await carregar();
  }

  async function desbloquear() {
    if (!desbloqueando) return;
    await usuarioService.removerBloqueio(desbloqueando.id);
    toast.success(`Bloqueio de ${desbloqueando.nome} removido.`);
    setDesbloqueando(null);
    await carregar();
  }

  return (
    <div>
      <PageHeader title="Usuários" />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>2FA</th>
              <th>Acesso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.emailLogin}</td>
                <td>{PERFIL_LABEL[u.perfil]}</td>
                <td>
                  <Badge tone={u.mfaAtivo ? "green" : u.perfil === "ALUNO" ? "neutral" : "orange"}>
                    {u.mfaAtivo ? "Ativo" : u.perfil === "ALUNO" ? "Inativo" : "Pendente"}
                  </Badge>
                </td>
                <td>{u.bloqueado ? <Badge tone="red">Bloqueado</Badge> : <Badge>Liberado</Badge>}</td>
                <td className="table-actions">
                  {u.mfaAtivo && u.id !== usuario?.id && (
                    <button className="btn btn-ghost btn-danger" onClick={() => setResetando(u)}>
                      Resetar 2FA
                    </button>
                  )}
                  {u.bloqueado && (
                    <button className="btn btn-ghost" onClick={() => setDesbloqueando(u)}>
                      Desbloquear
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resetando && (
        <ConfirmDialog
          title="Resetar autenticação em dois fatores"
          message={`Resetar o 2FA de ${resetando.nome}? As sessões abertas dessa pessoa serão encerradas, os códigos de recuperação deixam de valer e a configuração será pedida de novo no próximo login.`}
          confirmLabel="Resetar"
          tone="danger"
          onConfirm={() => void resetar()}
          onCancel={() => setResetando(null)}
        />
      )}

      {desbloqueando && (
        <ConfirmDialog
          title="Remover bloqueio"
          message={`Liberar o acesso de ${desbloqueando.nome}, bloqueado por excesso de tentativas?`}
          confirmLabel="Desbloquear"
          onConfirm={() => void desbloquear()}
          onCancel={() => setDesbloqueando(null)}
        />
      )}
    </div>
  );
}
