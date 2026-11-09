import { useEffect, useRef, useState, type ReactNode } from "react";
import { Campo } from "../ui/Campo";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { toast } from "../ui/Toast";
import { aprovacaoService, avisarAprovacoesAlteradas, type AlvoAprovacao, type TipoAprovacao } from "../../services";
import type { Evento, PassoAprovacao } from "../../types";

export type AcaoAprovacao = "aprovar" | "recusar" | "reenviar" | "historico";

interface DialogoAprovacaoProps {
  acao: AcaoAprovacao;
  tipo: TipoAprovacao;
  item: { id: string; nome: string };
  // "proposta": aprovar/recusar a proposta de alteracao de um item ja aprovado (padrao: o proprio item)
  alvo?: AlvoAprovacao;
  // o que muda (antes -> depois), mostrado na confirmacao
  detalhe?: ReactNode;
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
  PROPOSTA_ENVIADA: "Alteração proposta",
  PROPOSTA_EDITADA: "Proposta de alteração corrigida",
  PROPOSTA_APROVADA: "Alteração aprovada",
  PROPOSTA_RECUSADA: "Alteração recusada",
  PROPOSTA_REENVIADA: "Alteração reenviada depois da correção",
  PROPOSTA_CANCELADA: "Proposta de alteração cancelada",
  TRANSFERIDO: "Transferido",
};

// prefixo da mensagem no historico: motivo da recusa, resposta do reenvio; nas propostas a mensagem ja diz o que mudou
function prefixoDaMensagem(acao: PassoAprovacao["acao"]): string {
  if (acao === "RECUSADO" || acao === "PROPOSTA_RECUSADA") return "Motivo: ";
  if (acao === "REENVIADO") return "Resposta: ";
  return "";
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// os dialogos da aprovacao, iguais pra evento e palestrante:
// - aprovar: "Tem certeza que deseja aprovar?" (sem motivo);
// - recusar: motivo obrigatorio (minimo de 10 caracteres) e "Tem certeza que deseja recusar?";
// - reenviar (professor, item recusado): resposta opcional;
// - historico: cada envio, aprovacao, recusa (com motivo) e resposta, com data e autor
export function DialogoAprovacao({ acao, tipo, item, alvo = "item", detalhe, onFechar, onConcluido }: DialogoAprovacaoProps) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoRecusa, setConfirmandoRecusa] = useState(false);
  const [historico, setHistorico] = useState<PassoAprovacao[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nomeDoTipo = tipo === "EVENTO" ? "evento" : "palestrante";
  const daProposta = alvo === "proposta";
  const oQue = daProposta ? `a alteração de "${item.nome}"` : `"${item.nome}"`;
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

  async function executar(chamada: () => Promise<unknown>, mensagem: string | ((resposta: unknown) => string)) {
    setEnviando(true);
    try {
      const resposta = await chamada();
      toast.success(typeof mensagem === "string" ? mensagem : mensagem(resposta));
      avisarAprovacoesAlteradas();
      onConcluido();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
      onFechar();
    } finally {
      setEnviando(false);
    }
  }

  // aprovar a alteracao de um evento: diz quantos inscritos foram avisados por e-mail
  function mensagemDaAprovacao(resposta: unknown): string {
    if (!daProposta) return "Aprovado.";
    const aviso = (resposta as Evento | undefined)?.avisoInscritos;
    if (aviso && aviso.inscritos > 0) {
      return `Alteração aprovada. ${aviso.avisados} de ${aviso.inscritos} inscrito(s) avisado(s) por e-mail.`;
    }
    return "Alteração aprovada.";
  }

  if (acao === "aprovar") {
    return (
      <ConfirmDialog
        title={daProposta ? `Aprovar alteração do ${nomeDoTipo}` : `Aprovar ${nomeDoTipo}`}
        message={`Tem certeza que deseja aprovar ${oQue}?`}
        confirmLabel="Aprovar"
        onConfirm={() => void executar(() => aprovacaoService.aprovar(tipo, item.id, alvo), mensagemDaAprovacao)}
        onCancel={onFechar}
      >
        {detalhe}
      </ConfirmDialog>
    );
  }

  if (acao === "recusar") {
    if (confirmandoRecusa) {
      return (
        <ConfirmDialog
          title={daProposta ? `Recusar alteração do ${nomeDoTipo}` : `Recusar ${nomeDoTipo}`}
          message={`Tem certeza que deseja recusar ${oQue}?`}
          confirmLabel="Recusar"
          tone="danger"
          onConfirm={() =>
            void executar(
              () => aprovacaoService.recusar(tipo, item.id, texto.trim(), alvo),
              daProposta ? "Alteração recusada. O item continua como estava e o professor vê o motivo no sistema." : "Recusado. O professor vê o motivo no sistema.",
            )
          }
          onCancel={() => setConfirmandoRecusa(false)}
        />
      );
    }
    return (
      <Modal title={daProposta ? `Recusar alteração do ${nomeDoTipo}` : `Recusar ${nomeDoTipo}`} onClose={onFechar}>
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
          {detalhe}
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
                  {prefixoDaMensagem(passo.acao)}
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
