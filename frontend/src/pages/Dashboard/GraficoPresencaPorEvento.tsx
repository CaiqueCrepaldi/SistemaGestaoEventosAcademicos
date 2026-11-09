import type { EventoDashboard } from "../../services";
import { GraficoBarrasPorEvento, type SegmentoGrafico } from "./GraficoBarrasPorEvento";

// presente = check-in aprovado (verde) | aguardando = sem pedido ou pedido esperando aprovacao (cinza) |
// ausente = nao pediu a tempo ou teve o pedido recusado (vermelho)
const SEGMENTOS: readonly SegmentoGrafico[] = [
  { chave: "presentes", classe: "verde", rotulo: "Presentes (check-in aprovado)" },
  { chave: "aguardando", classe: "cinza", rotulo: "Aguardando check-in ou aprovação" },
  { chave: "ausentes", classe: "vermelho", rotulo: "Ausentes ou recusados" },
];

// inscricoes por evento (comprimento da barra) divididas pela situacao do check-in (segmentos)
export function GraficoPresencaPorEvento({ eventos }: { eventos: EventoDashboard[] }) {
  return (
    <GraficoBarrasPorEvento
      eventos={eventos}
      total="inscritos"
      rotuloTotal="Inscrições"
      segmentos={SEGMENTOS}
      vazio="Nenhum evento cadastrado ainda."
    />
  );
}
