interface BadgeProps {
  children: string;
  tone?: "neutral" | "green" | "red" | "orange";
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
