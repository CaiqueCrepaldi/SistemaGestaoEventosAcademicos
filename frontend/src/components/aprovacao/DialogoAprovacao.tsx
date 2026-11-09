import { useEffect, useRef, useState } from "react";
import { Campo } from "../ui/Campo";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { toast } from "../ui/Toast";
import { aprovacaoService, avisarAprovacoesAlteradas, type TipoAprovacao } from "../../services";
import type { PassoAprovacao } from "../../types";

export type AcaoAprovacao = "aprovar" | "recusar" | "reenviar" | "historico";

interface DialogoAprovacaoProps {
  acao: AcaoAprovacao;
  tipo: TipoAprovacao;
  item: { id: string; nome: string };
  onFechar: () => void;
  // depois de aprovar, recusar ou reenviar (a tela recarrega a lista)
  onConcluido: () => void;
}

const MOTIVO_MINIMO = 10;

const ROTULO_PASSO: Record<PassoAprovacao["acao"], string> = {
  ENVIADO: "Enviado para aprovação",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  REENVIADO: "Reenviado depois da correção",
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// os dialogos da aprovacao, iguais pra evento e palestrante:
// - aprovar: "Tem certeza que deseja aprovar?" (sem motivo);
// - recusar: motivo obrigatorio (minimo de 10 caracteres) e "Tem certeza que deseja recusar?";
// - reenviar (professor, item recusado): resposta opcional;
// - historico: cada envio, aprovacao, recusa (com motivo) e resposta, com data e autor
export function DialogoAprovacao({ acao, tipo, item, onFechar, onConcluido }: DialogoAprovacaoProps) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoRecusa, setConfirmandoRecusa] = useState(false);
  const [historico, setHistorico] = useState<PassoAprovacao[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nomeDoTipo = tipo === "EVENTO" ? "evento" : "palestrante";
  // a tela pode passar uma funcao nova a cada render: o ref evita recarregar o historico por isso
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    if (acao !== "historico") return;
    aprovacaoService
      .historico(tipo, item.id)
      .then(setHistorico)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Não foi possível carregar o histórico.");
        fecharRef.current();
      });
  }, [acao, tipo, item.id]);

  async function executar(chamada: () => Promise<unknown>, mensagem: string) {
    setEnviando(true);
    try {
      await chamada();
      toast.success(mensagem);
      avisarAprovacoesAlteradas();
      onConcluido();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
      onFechar();
    } finally {
      setEnviando(false);
    }
  }

  if (acao === "aprovar") {
    return (
      <ConfirmDialog
        title={`Aprovar ${nomeDoTipo}`}
        message={`Tem certeza que deseja aprovar "${item.nome}"?`}
        confirmLabel="Aprovar"
        onConfirm={() => void executar(() => aprovacaoService.aprovar(tipo, item.id), "Aprovado.")}
        onCancel={onFechar}
      />
    );
  }

  if (acao === "recusar") {
    if (confirmandoRecusa) {
      return (
        <ConfirmDialog
          title={`Recusar ${nomeDoTipo}`}
          message={`Tem certeza que deseja recusar "${item.nome}"?`}
          confirmLabel="Recusar"
          tone="danger"
          onConfirm={() => void executar(() => aprovacaoService.recusar(tipo, item.id, texto.trim()), "Recusado. O professor vê o motivo no sistema.")}
          onCancel={() => setConfirmandoRecusa(false)}
        />
      );
    }
    return (
      <Modal title={`Recusar ${nomeDoTipo}`} onClose={onFechar}>
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim().length < MOTIVO_MINIMO) {
              setErro(`Informe o motivo da recusa (mínimo de ${MOTIVO_MINIMO} caracteres).`);
              return;
            }
            setConfirmandoRecusa(true);
          }}
        >
          <p className="form-hint">O professor vê este motivo no sistema para corrigir e reenviar &ldquo;{item.nome}&rdquo;.</p>
          <Campo nome="motivoRecusa" rotulo="Motivo da recusa" obrigatorio erro={erro ?? undefined}>
            <textarea
              rows={4}
              maxLength={1000}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setErro(null);
              }}
              autoFocus
            />
          </Campo>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger-solid">
              Recusar
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  if (acao === "reenviar") {
    return (
      <Modal title={`Reenviar ${nomeDoTipo} para aprovação`} onClose={onFechar}>
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void executar(() => aprovacaoService.reenviar(tipo, item.id, texto), "Reenviado para aprovação.");
          }}
        >
          <p className="form-hint">Corrija o que foi pedido antes de reenviar &ldquo;{item.nome}&rdquo;. A equipe vê a sua resposta no histórico.</p>
          <Campo nome="respostaReenvio" rotulo="Resposta para a equipe (opcional)">
            <textarea rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </Campo>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              Reenviar para aprovação
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={`Histórico da aprovação — ${item.nome}`} onClose={onFechar}>
      {historico === null ? (
        <p className="form-hint">Carregando histórico…</p>
      ) : historico.length === 0 ? (
        <p className="form-hint">Sem histórico de aprovação: criado pela equipe, já nasceu aprovado.</p>
      ) : (
        <ol className="historico-aprovacao">
          {historico.map((passo, indice) => (
            <li key={indice}>
              <strong>{ROTULO_PASSO[passo.acao]}</strong>
              <span className="form-hint">
                {" "}
                · {dataHora(passo.criadoEm)}
                {passo.autorNome ? ` · ${passo.autorNome}` : ""}
              </span>
              {passo.mensagem && (
                <p className="historico-mensagem">
                  {passo.acao === "RECUSADO" ? "Motivo: " : "Resposta: "}
                  {passo.mensagem}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="modal-footer">
        <button type="button" className="btn btn-primary" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
