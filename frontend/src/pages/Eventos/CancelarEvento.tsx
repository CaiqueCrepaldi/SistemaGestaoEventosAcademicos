import { useState } from "react";
import { Campo } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { toast } from "../../components/ui/Toast";
import { ApiError, eventoService } from "../../services";
import type { Evento } from "../../types";

// mesmos limites da API (cancelamentoEventoSchema): o motivo vai no e-mail aos inscritos e na tela
export const MOTIVO_CANCELAMENTO_MINIMO = 10;
export const MOTIVO_CANCELAMENTO_MAXIMO = 500;

interface ModalCancelarEventoProps {
  evento: Evento;
  onFechar: () => void;
  // depois de cancelar (a tela recarrega o mes)
  onCancelado: () => void;
}

function dataHoraDoEvento(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// so a equipe (administrador e secretaria) ve: evento aprovado e ainda nao iniciado. O botao de cancelar fica
// desativado ate o motivo ter o minimo e pede confirmacao; a API confere tudo de novo
export function ModalCancelarEvento({ evento, onFechar, onCancelado }: ModalCancelarEventoProps) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const tamanho = motivo.trim().length;
  const inscritos = evento.inscritos ?? 0;

  async function cancelar() {
    setEnviando(true);
    try {
      const resposta = await eventoService.cancelar(evento.id, motivo.trim());
      const aviso = resposta.avisoInscritos;
      toast.success(
        aviso && aviso.inscritos > 0
          ? `Evento cancelado. ${aviso.avisados} de ${aviso.inscritos} inscrito(s) avisado(s) por e-mail.`
          : "Evento cancelado.",
      );
      onCancelado();
    } catch (e) {
      setConfirmando(false);
      // erro no motivo (validacao) fica embaixo do campo; o resto (ja comecou, ja cancelado...) em aviso
      const doMotivo = e instanceof ApiError ? e.errors?.find((campo) => campo.campo === "motivo") : undefined;
      if (doMotivo) setErro(doMotivo.mensagem);
      else {
        toast.error(e instanceof Error ? e.message : "Não foi possível cancelar o evento.");
        onFechar();
      }
    } finally {
      setEnviando(false);
    }
  }

  if (confirmando) {
    return (
      <ConfirmDialog
        title="Cancelar evento"
        message="Tem certeza? Esta ação não pode ser desfeita e todos os inscritos serão avisados por e-mail."
        confirmLabel={enviando ? "Cancelando…" : "Cancelar evento"}
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => {
          if (!enviando) void cancelar();
        }}
        onCancel={() => setConfirmando(false)}
      />
    );
  }

  return (
    <Modal title="Cancelar evento" onClose={onFechar}>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (tamanho < MOTIVO_CANCELAMENTO_MINIMO) {
            setErro(`Informe o motivo do cancelamento (mínimo de ${MOTIVO_CANCELAMENTO_MINIMO} caracteres).`);
            return;
          }
          setConfirmando(true);
        }}
      >
        <div className="cancelar-evento-resumo">
          <strong>{evento.titulo}</strong>
          <span>{dataHoraDoEvento(evento.horario)}</span>
        </div>
        <p className="form-hint">
          {inscritos === 0
            ? "O evento não tem inscritos."
            : inscritos === 1
              ? "1 inscrito será avisado por e-mail."
              : `${inscritos} inscritos serão avisados por e-mail.`}{" "}
          As inscrições não são apagadas: ficam no histórico do aluno, e a sala fica livre nesse horário.
        </p>
        <Campo nome="motivoCancelamento" rotulo="Motivo do cancelamento" obrigatorio erro={erro ?? undefined}>
          <textarea
            rows={4}
            maxLength={MOTIVO_CANCELAMENTO_MAXIMO}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErro(null);
            }}
            autoFocus
          />
        </Campo>
        <p className={"form-hint contador-caracteres" + (tamanho > 0 && tamanho < MOTIVO_CANCELAMENTO_MINIMO ? " contador-abaixo" : "")} aria-live="polite">
          {tamanho}/{MOTIVO_CANCELAMENTO_MAXIMO} caracteres (mínimo {MOTIVO_CANCELAMENTO_MINIMO})
        </p>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className="btn btn-danger-solid" disabled={tamanho < MOTIVO_CANCELAMENTO_MINIMO}>
            Cancelar evento
          </button>
        </div>
      </form>
    </Modal>
  );
}
