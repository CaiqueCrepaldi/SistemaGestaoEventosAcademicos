import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { auditoriaService } from "../../services";
import type { LogAuditoria } from "../../services";

// traduz o codigo da acao pra um texto legivel na tela
const ACAO_LABEL: Record<string, string> = {
  LOGIN_SUCESSO: "Login realizado",
  LOGIN_FALHA: "Falha de login",
  USUARIO_REGISTRADO: "Novo cadastro de aluno",
  PARTICIPANTE_INATIVADO: "Participante inativado",
  PARTICIPANTE_REATIVADO: "Participante reativado",
  PARTICIPANTE_REMOVIDO: "Participante removido",
  EVENTO_CRIADO: "Evento criado",
  EVENTO_ATUALIZADO: "Evento atualizado",
  EVENTO_REMOVIDO: "Evento removido",
  PRESENCA_CONFIRMADA: "Presença confirmada",
  PRESENCA_MARCADA_AUSENTE: "Presença marcada como ausente",
};

// trilha de auditoria — so leitura, exclusiva de administrador/secretaria
export function AuditoriaPage() {
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    try {
      setLogs(await auditoriaService.listar());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a trilha de auditoria.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      <PageHeader title="Auditoria" />
      <div className="card">
        <p className="form-hint" style={{ marginBottom: 14 }}>
          Registro dos últimos {logs.length} eventos de login e mudanças em registros críticos do sistema.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Data/hora</th>
              <th>Responsável</th>
              <th>Ação</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  Carregando…
                </td>
              </tr>
            ) : (
              <>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.criadoEm).toLocaleString("pt-BR")}</td>
                    <td>{log.atorNome ?? "—"}</td>
                    <td>{ACAO_LABEL[log.acao] ?? log.acao}</td>
                    <td>{log.detalhe ?? "—"}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      Nenhum registro de auditoria ainda.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
