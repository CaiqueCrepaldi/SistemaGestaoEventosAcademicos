import type { EventoDashboard } from "../../services";
import { GraficoBarrasPorEvento, type SegmentoGrafico } from "./GraficoBarrasPorEvento";

// aprovado (verde) | ainda pode responder (cinza) | reprovado (vermelho) — mesma ordem e cores do
// grafico de presenca
const SEGMENTOS: readonly SegmentoGrafico[] = [
  { chave: "aprovados", classe: "verde", rotulo: "Aprovados" },
  { chave: "podemResponder", classe: "cinza", rotulo: "Ainda podem responder" },
  { chave: "reprovados", classe: "vermelho", rotulo: "Reprovados" },
];

// indicador de aprendizagem (RF021): os alunos com presenca confirmada em cada evento (comprimento da
// barra) divididos pelo resultado do questionario. Evento sem nenhuma presenca confirmada fica de fora
// (nao ha o que medir ainda)
export function GraficoAprendizagemPorEvento({ eventos }: { eventos: EventoDashboard[] }) {
  return (
    <GraficoBarrasPorEvento
      eventos={eventos.filter((evento) => evento.presentes > 0)}
      total="presentes"
      rotuloTotal="Presentes"
      segmentos={SEGMENTOS}
      vazio="Nenhum aluno com presença confirmada ainda."
    />
  );
}
