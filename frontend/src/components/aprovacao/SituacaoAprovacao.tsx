import { Badge } from "../ui/Badge";
import type { SituacaoAprovacao as Situacao } from "../../types";

const ROTULO: Record<Situacao, string> = {
  PENDENTE: "Aguardando aprovação",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

const TOM: Record<Situacao, "orange" | "green" | "red"> = {
  PENDENTE: "orange",
  APROVADO: "green",
  RECUSADO: "red",
};

// situacao da aprovacao de um evento/palestrante (selo com texto, nao so cor) e, quando recusado, o motivo
export function SituacaoAprovacao({ situacao, motivoRecusa }: { situacao?: Situacao; motivoRecusa?: string | null }) {
  if (!situacao) return null;
  return (
    <div className="situacao-aprovacao">
      <Badge tone={TOM[situacao]}>{ROTULO[situacao]}</Badge>
      {situacao === "RECUSADO" && motivoRecusa && <p className="form-hint motivo-recusa">Motivo: {motivoRecusa}</p>}
    </div>
  );
}
