import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
