interface BadgeProps {
  children: string;
  tone?: "neutral" | "green" | "red" | "orange";
}

// etiqueta coloridinha de status (ex.: "Presente", "Pendente")
export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
