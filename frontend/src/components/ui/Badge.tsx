interface BadgeProps {
  children: string;
  tone?: "neutral" | "green" | "red" | "orange";
}

// Etiqueta colorida usada pra status (ex.: "Presente"/"Ausente",
// "Programado"/"Encerrado"). `tone` só troca a classe CSS de cor.
export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
