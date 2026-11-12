import { useCallback, useEffect, useState } from "react";
import { Badge } from "../ui/Badge";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";
import { ApiError, checkinService, type PainelCheckin, type PedidoCheckin } from "../../services";
import { corPresenca, dataHora, rotuloPresenca } from "../../utils/presenca";

type Confirmacao =
  | { tipo: "aprovar" | "recusar"; item: PedidoCheckin; reverter: boolean }
  | { tipo: "todos"; quantidade: number };

function textoDaJanela(painel: PainelCheckin): string {
  const { abre, fecha, situacao } = painel.janela;
  if (situacao === "ANTES") return `O check-in abre em ${dataHora(abre)} (1 hora antes do início).`;
  if (situacao === "FECHADA") return `O check-in foi encerrado em ${dataHora(fecha)} (24 horas depois do fim). Nada mais muda.`;
  return `Check-in aberto até ${dataHora(fecha)} (24 horas depois do fim).`;
}

// painel "Check-ins" de UM evento: os pedidos dos alunos esperando decisao (aprovar, recusar, aprovar
// todos) e os ja decididos (reverter PRESENTE <-> RECUSADO enquanto a janela esta aberta e o aluno nao
// respondeu o questionario). Usado na tela Check-in e dentro do evento (tela Eventos)
export function PainelCheckins({ eventoId, onAlterado }: { eventoId: string; onAlterado?: () => void }) {
  const [painel, setPainel] = useState<PainelCheckin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setPainel(await checkinService.painel(eventoId));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os check-ins.");
    }
  }, [eventoId]);

  useEffect(() => {
    setPainel(null);
    void carregar();
  }, [carregar]);

  async function confirmar() {
    if (!confirmacao || enviando) return;
    setEnviando(true);
    try {
      if (confirmacao.tipo === "todos") {
        const { aprovados } = await checkinService.aprovarTodos(eventoId);
        toast.success(`${aprovados} pedido(s) de check-in aprovado(s).`);
      } else if (confirmacao.tipo === "aprovar") {
        await checkinService.aprovar(confirmacao.item.inscricaoId);
        toast.success(confirmacao.reverter ? "Decisão revertida: presença confirmada." : "Check-in aprovado.");
      } else {
        await checkinService.recusar(confirmacao.item.inscricaoId);
        toast.success(confirmacao.reverter ? "Decisão revertida: check-in recusado." : "Check-in recusado.");
      }
      onAlterado?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível registrar a decisão.");
    } finally {
      setEnviando(false);
      setConfirmacao(null);
      await carregar();
    }
  }

  if (erro) return <p className="form-error">{erro}</p>;
  if (!painel) return <p className="form-hint">Carregando check-ins…</p>;

  const aberta = painel.janela.situacao === "ABERTA";
  const aptosParaTodos = painel.pedidos.filter((p) => p.participanteAtivo).length;

  return (
    <div className="painel-checkins">
      <p className="form-hint">{textoDaJanela(painel)}</p>

      <div className="painel-checkins-titulo">
        <h3>Pedidos aguardando aprovação ({painel.pedidos.length})</h3>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!aberta || aptosParaTodos === 0}
          onClick={() => setConfirmacao({ tipo: "todos", quantidade: aptosParaTodos })}
        >
          Aprovar todos
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Aluno</th>
            <th>RGM</th>
            <th>Pedido em</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {painel.pedidos.map((item) => (
            <tr key={item.inscricaoId}>
              <td>
                {item.participanteNome || "—"} {!item.participanteAtivo && <Badge tone="red">Inativo</Badge>}
              </td>
              <td>{item.participanteRgm}</td>
              <td>{item.checkinSolicitadoEm ? dataHora(item.checkinSolicitadoEm) : "—"}</td>
              <td className="table-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!aberta || !item.participanteAtivo}
                  title={!item.participanteAtivo ? "Aluno inativo: não é possível confirmar presença." : undefined}
                  onClick={() => setConfirmacao({ tipo: "aprovar", item, reverter: false })}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  disabled={!aberta}
                  onClick={() => setConfirmacao({ tipo: "recusar", item, reverter: false })}
                >
                  Recusar
                </button>
              </td>
            </tr>
          ))}
          {painel.pedidos.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-cell">
                Nenhum pedido de check-in esperando decisão.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Já decididos ({painel.decididos.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Aluno</th>
            <th>RGM</th>
            <th>Situação</th>
            <th>Decidido em</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {painel.decididos.map((item) => {
            const paraPresente = item.statusPresenca === "RECUSADO";
            const bloqueio = item.presencaTravada
              ? "A presença não pode mais ser alterada: o aluno já respondeu o questionário."
              : paraPresente && !item.participanteAtivo
                ? "Aluno inativo: não é possível confirmar presença."
                : null;
            return (
              <tr key={item.inscricaoId}>
                <td>
                  {item.participanteNome || "—"} {!item.participanteAtivo && <Badge tone="red">Inativo</Badge>}
                  {item.presencaTravada && <div className="form-hint">Já respondeu o questionário.</div>}
                </td>
                <td>{item.participanteRgm}</td>
                <td>
                  <Badge tone={corPresenca(item.statusPresenca)}>{rotuloPresenca(item.statusPresenca)}</Badge>
                </td>
                <td>
                  {item.decididoEm ? dataHora(item.decididoEm) : "—"}
                  {item.decididoPor && <div className="form-hint">por {item.decididoPor}</div>}
                </td>
                <td className="table-actions">
                  {aberta && (
                    <button
                      type="button"
                      className={"btn btn-ghost" + (paraPresente ? "" : " btn-danger")}
                      disabled={bloqueio !== null}
                      title={bloqueio ?? undefined}
                      onClick={() => setConfirmacao({ tipo: paraPresente ? "aprovar" : "recusar", item, reverter: true })}
                    >
                      {paraPresente ? "Reverter para presente" : "Reverter para recusado"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {painel.decididos.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-cell">
                Nenhum check-in decidido ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="form-hint" style={{ marginTop: 8 }}>
        {painel.semPedido} inscrito(s) ainda sem pedido de check-in · {painel.ausentes} ausente(s)
      </p>

      {confirmacao?.tipo === "todos" && (
        <ConfirmDialog
          title="Aprovar todos os pedidos"
          message={`Tem certeza que deseja aprovar os ${confirmacao.quantidade} pedidos?`}
          confirmLabel="Aprovar todos"
          onConfirm={() => void confirmar()}
          onCancel={() => setConfirmacao(null)}
        />
      )}
      {confirmacao && confirmacao.tipo !== "todos" && (
        <ConfirmDialog
          title={`${confirmacao.reverter ? "Reverter: " : ""}${confirmacao.tipo === "aprovar" ? "aprovar" : "recusar"} o check-in de ${confirmacao.item.participanteNome || "aluno"}`}
          message={
            confirmacao.tipo === "aprovar"
              ? "Tem certeza que deseja aprovar?"
              : confirmacao.reverter && confirmacao.item.avaliou
                ? "Este aluno já avaliou o evento. Ao desfazer a presença, a avaliação dele será apagada."
                : "Tem certeza que deseja recusar?"
          }
          confirmLabel={confirmacao.tipo === "aprovar" ? "Aprovar" : "Recusar"}
          tone={confirmacao.tipo === "recusar" ? "danger" : "default"}
          onConfirm={() => void confirmar()}
          onCancel={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}
