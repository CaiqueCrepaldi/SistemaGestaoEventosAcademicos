import type { EventoDashboard } from "../../services";
import { GraficoBarrasPorEvento, type SegmentoGrafico } from "./GraficoBarrasPorEvento";

// presente (verde) | pendente (cinza) | ausente (vermelho)
const SEGMENTOS: readonly SegmentoGrafico[] = [
  { chave: "presentes", classe: "verde", rotulo: "Presentes" },
  { chave: "pendentes", classe: "cinza", rotulo: "Pendentes" },
  { chave: "ausentes", classe: "vermelho", rotulo: "Ausentes" },
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
