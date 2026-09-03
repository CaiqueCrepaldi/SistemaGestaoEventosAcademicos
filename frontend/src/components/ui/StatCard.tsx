interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "blue" | "green" | "orange" | "purple";
}

// Cartão de número grande usado no Dashboard e no Feedback (ex.: "Taxa de
// presença: 25%"). `hint` é um texto pequeno opcional embaixo do valor.
export function StatCard({ label, value, hint, tone = "blue" }: StatCardProps) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
      {hint && <span className="stat-card-hint">{hint}</span>}
    </div>
  );
}
