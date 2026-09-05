import { useEffect, useState } from "react";

type ToastTipo = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tipo: ToastTipo;
  mensagem: string;
}

// pub/sub simples, sem context - da pra chamar toast.error() de dentro de um service tambem
let proximoId = 1;
let ouvintes: Array<(item: ToastItem) => void> = [];

function emitir(tipo: ToastTipo, mensagem: string) {
  const item: ToastItem = { id: proximoId++, tipo, mensagem };
  ouvintes.forEach((ouvinte) => ouvinte(item));
}

export const toast = {
  success: (mensagem: string) => emitir("success", mensagem),
  error: (mensagem: string) => emitir("error", mensagem),
  info: (mensagem: string) => emitir("info", mensagem),
};

const DURACAO_MS = 5000;

// um <ToastViewport /> montado na raiz ja cobre qualquer toast.*() chamado em qualquer lugar
export function ToastViewport() {
  const [itens, setItens] = useState<ToastItem[]>([]);

  useEffect(() => {
    function ouvinte(item: ToastItem) {
      setItens((prev) => [...prev, item]);
      setTimeout(() => {
        setItens((prev) => prev.filter((i) => i.id !== item.id));
      }, DURACAO_MS);
    }
    ouvintes.push(ouvinte);
    return () => {
      ouvintes = ouvintes.filter((o) => o !== ouvinte);
    };
  }, []);

  function fechar(id: number) {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  if (itens.length === 0) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {itens.map((item) => (
        <div key={item.id} className={`toast toast-${item.tipo}`}>
          <span>{item.mensagem}</span>
          <button className="toast-close" onClick={() => fechar(item.id)} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
