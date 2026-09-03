import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

// Cabeçalho padrão do topo de cada página (título + botão(ões) de ação,
// como "+ Novo evento"). Repetido em toda tela pra manter o mesmo
// espaçamento/tipografia sem copiar o HTML cada vez.
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
