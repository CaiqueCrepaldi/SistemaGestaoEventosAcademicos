import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

// Cabeçalho padrão do topo de cada página (título + subtítulo opcional +
// botão(ões) de ação, como "+ Novo evento"). Repetido em toda tela pra
// manter o mesmo espaçamento/tipografia sem copiar o HTML cada vez.
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
