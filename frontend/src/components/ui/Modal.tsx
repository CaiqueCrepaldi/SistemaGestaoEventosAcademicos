import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

// Janela modal genérica usada por toda tela de cadastro/edição (Eventos,
// Salas, Palestrantes etc.) — cada página só passa o formulário como
// `children`, a estrutura visual (fundo escurecido, cabeçalho com X) é
// sempre a mesma.
export function Modal({ title, onClose, children, wide }: ModalProps) {
  return (
    // onMouseDown no fundo fecha o modal; stopPropagation no conteúdo
    // impede que um clique dentro do modal feche ele por engano.
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={"modal" + (wide ? " modal-wide" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
