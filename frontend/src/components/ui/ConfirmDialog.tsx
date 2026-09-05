import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

// confirmacao usando o Modal padrao, no lugar do confirm() nativo
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
