import { useEffect, useState } from "react";

type ToastTipo = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tipo: ToastTipo;
  mensagem: string;
}

// Pub/sub bem simples em módulo (sem Context) — qualquer arquivo, seja
// componente React ou um service puro (authService, emailService), pode
// chamar `toast.error("...")` sem precisar estar dentro da árvore do React.
// É o substituto de `alert()`/`console.log` pedido pra todo aviso automático
// do site.
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

// Monte um único <ToastViewport /> por árvore de rotas (Layout, pra telas
// autenticadas, e o wrapper de rotas públicas em App.tsx, pra Login/Cadastro/
// Esqueci senha) — todo `toast.*()` chamado em qualquer lugar aparece nele.
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
