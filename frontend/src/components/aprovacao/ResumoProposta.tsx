import { Badge } from "../ui/Badge";
import type { SituacaoAprovacao } from "../../types";

// uma linha do "antes -> depois" de uma proposta de alteracao
export interface Mudanca {
  rotulo: string;
  antes: string;
  depois: string;
}

export function ListaMudancas({ mudancas }: { mudancas: Mudanca[] }) {
  if (mudancas.length === 0) return null;
  return (
    <ul className="proposta-mudancas">
      {mudancas.map((m) => (
        <li key={m.rotulo}>
          <strong>{m.rotulo}:</strong> {m.antes} → <strong>{m.depois}</strong>
        </li>
      ))}
    </ul>
  );
}

// a proposta aberta de um item aprovado (evento ou palestrante): selo com texto (aguardando ou recusada), o
// motivo da recusa e o que muda
export function ResumoProposta({
  situacao,
  motivoRecusa,
  mudancas,
}: {
  situacao: SituacaoAprovacao;
  motivoRecusa: string | null;
  mudancas: Mudanca[];
}) {
  return (
    <div className="proposta-resumo">
      <Badge tone={situacao === "RECUSADO" ? "red" : "orange"}>
        {situacao === "RECUSADO" ? "Alteração recusada" : "Alteração aguardando aprovação"}
      </Badge>
      {situacao === "RECUSADO" && motivoRecusa && <p className="form-hint motivo-recusa">Motivo: {motivoRecusa}</p>}
      <ListaMudancas mudancas={mudancas} />
    </div>
  );
}
