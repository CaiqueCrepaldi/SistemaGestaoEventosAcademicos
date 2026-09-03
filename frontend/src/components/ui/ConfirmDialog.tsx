import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmação "bonitinha" (usa o mesmo Modal do resto do site) no lugar do
// confirm() nativo do navegador — usada antes de excluir ou de salvar uma
// edição em qualquer tela de cadastro.
export function ConfirmDialog({ title, message, confirmLabel = "Confirmar", tone = "default", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ margin: "0 0 4px" }}>{message}</p>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className={"btn " + (tone === "danger" ? "btn-danger-solid" : "btn-primary")} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
