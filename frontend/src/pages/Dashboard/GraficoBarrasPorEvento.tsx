import type { EventoDashboard } from "../../services";

// campos numericos de um evento do dashboard que podem virar segmento da barra
type CampoNumerico = { [K in keyof EventoDashboard]: EventoDashboard[K] extends number ? K : never }[keyof EventoDashboard];

export interface SegmentoGrafico {
  chave: CampoNumerico;
  // cor do segmento e da amostra na legenda (ver .grafico-segmento no global.css)
  classe: "verde" | "cinza" | "vermelho";
  rotulo: string;
}

interface GraficoBarrasPorEventoProps {
  eventos: EventoDashboard[];
  // o comprimento da barra (mesma escala pra todos os eventos) e a coluna do total na tabela
  total: CampoNumerico;
  rotuloTotal: string;
  // ordem fixa dos segmentos e da legenda: verde | cinza neutro | vermelho. O cinza no meio separa
  // verde e vermelho, que lado a lado se confundem pra quem tem daltonismo; legenda, numero na ponta,
  // dica no hover e a tabela garantem que nada depende so da cor
  segmentos: readonly SegmentoGrafico[];
  vazio: string;
}

// espaco reservado na linha pro numero do total (ate 4 digitos) + o respiro antes dele
const ESPACO_TOTAL_PX = 40;

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// barras horizontais empilhadas por evento, usadas em "Presença por evento" e "Aprendizagem por
// evento". Grafico em HTML/CSS puro, sem biblioteca, com legenda e os mesmos dados em tabela
export function GraficoBarrasPorEvento({ eventos, total, rotuloTotal, segmentos, vazio }: GraficoBarrasPorEventoProps) {
  if (eventos.length === 0) {
    return <p className="empty-cell">{vazio}</p>;
  }

  const maiorTotal = Math.max(...eventos.map((e) => e[total]), 1);

  return (
    <div>
      <ul className="grafico-legenda" aria-label="Legenda">
        {segmentos.map((s) => (
          <li key={s.chave}>
            <span className={`grafico-amostra ${s.classe}`} aria-hidden="true" />
            {s.rotulo}
          </li>
        ))}
      </ul>

      <ul className="grafico-linhas list-scroll">
        {eventos.map((evento) => {
          const descricao =
            `${evento.titulo}: ${evento[total]} ${rotuloTotal.toLowerCase()} — ` +
            segmentos.map((s) => `${evento[s.chave]} ${s.rotulo.toLowerCase()}`).join(", ");
          return (
            <li key={evento.id} className="grafico-linha">
              <div className="grafico-rotulo">
                {evento.titulo}
                <span>{dataCurta(evento.horario)}</span>
              </div>
              <div className="grafico-trilho" role="img" aria-label={descricao} title={descricao}>
                {/* desconta o espaco do total, que vem escrito logo depois da ponta da barra */}
                <div className="grafico-barra" style={{ width: `calc((100% - ${ESPACO_TOTAL_PX}px) * ${evento[total] / maiorTotal})` }}>
                  {segmentos
                    .filter((s) => evento[s.chave] > 0)
                    .map((s) => (
                      <span
                        key={s.chave}
                        className={`grafico-segmento ${s.classe}`}
                        style={{ flexGrow: evento[s.chave], flexBasis: 0 }}
                        title={`${s.rotulo}: ${evento[s.chave]}`}
                      />
                    ))}
                </div>
                <span className="grafico-total">{evento[total]}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <details className="grafico-tabela">
        <summary>Ver dados em tabela</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data</th>
                <th>{rotuloTotal}</th>
                {segmentos.map((s) => (
                  <th key={s.chave}>{s.rotulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{evento.titulo}</td>
                  <td>{dataCurta(evento.horario)}</td>
                  <td>{evento[total]}</td>
                  {segmentos.map((s) => (
                    <td key={s.chave}>{evento[s.chave]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
